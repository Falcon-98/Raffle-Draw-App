/**
 * Raffle live server for Cloudflare Workers.
 *
 * Same API as server/live-server.mjs (the JSON-file Node server), so the website works
 * with either one — just enter this Worker's address in Admin → Online live view.
 *
 *   GET    /api/health                 → { ok, needsToken }
 *   POST   /api/rooms                  → { code, key }        (X-Live-Token if LIVE_CREATE_TOKEN is set)
 *   GET    /api/rooms/:code            → { state, updatedAt, viewers }
 *   GET    /api/rooms/:code/events     → live stream (Server-Sent Events)
 *   PUT    /api/rooms/:code            → publish the screen   (Authorization: Bearer <key>)
 *   DELETE /api/rooms/:code            → end the live view    (Authorization: Bearer <key>)
 *
 * Every room is one Durable Object. It keeps the room's JSON (state, key hash, times) in its own
 * storage and holds the viewers' open streams, so updates reach everyone instantly.
 */

export interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
  LIVE_CREATE_TOKEN?: string;
}

const MAX_BODY = 1024 * 1024; // 1 MB per published screen
const IDLE_TTL = 7 * 24 * 3600 * 1000; // rooms untouched for a week are deleted
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/* ------------------------------------------------------------- helpers */

const enc = new TextEncoder();

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sameHash(a: string, b: string) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function randomKey() {
  return [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(status: number, body: unknown, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function corsHeaders(req: Request, env: Env): { ok: boolean; headers: Record<string, string> } {
  const origin = req.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = !origin || allowed.length === 0 || allowed.includes(origin);
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Live-Token',
    'Access-Control-Max-Age': '600',
  };
  if (origin && ok) headers['Access-Control-Allow-Origin'] = origin;
  return { ok, headers };
}

function withHeaders(res: Response, headers: Record<string, string>) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
  return r;
}

/* --------------------------------------------------------------- worker */

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const { ok, headers } = corsHeaders(req, env);
    if (!url.pathname.startsWith('/api/')) {
      return json(404, { error: 'not found', hint: 'This is the raffle live server. Open the viewer link shared by the organisers.' });
    }
    if (!ok) return json(403, { error: 'origin not allowed' }, headers);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const res = await route(req, env, url);
    return withHeaders(res, headers);
  },
} satisfies ExportedHandler<Env>;

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/health' && req.method === 'GET') {
    return json(200, { ok: true, needsToken: !!env.LIVE_CREATE_TOKEN, host: 'cloudflare' });
  }

  if (path === '/api/rooms' && req.method === 'POST') {
    if (env.LIVE_CREATE_TOKEN) {
      const given = await sha256(req.headers.get('X-Live-Token') || '');
      if (!sameHash(given, await sha256(env.LIVE_CREATE_TOKEN))) return json(401, { error: 'Wrong live server password' });
    }
    const key = randomKey();
    const keyHash = await sha256(key);
    for (let i = 0; i < 5; i++) {
      const code = randomCode();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const r = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ keyHash }) });
      if (r.status === 201) return json(201, { code, key });
      if (r.status !== 409) return json(500, { error: 'Could not create the room' });
    }
    return json(500, { error: 'Could not create the room' });
  }

  const m = /^\/api\/rooms\/([A-Z0-9]{4,16})(\/events)?$/.exec(path);
  if (m) {
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    // Hand the request to the room; it answers itself (including the live stream).
    return stub.fetch(new Request(`https://room${m[2] ?? '/'}`, req));
  }

  return json(404, { error: 'not found' });
}

/* -------------------------------------------------------- one live room */

type Stored = { keyHash: string; state: unknown; createdAt: number; updatedAt: number };

export class Room implements DurableObject {
  private viewers = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private ping: ReturnType<typeof setInterval> | undefined;

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  private load() {
    return this.ctx.storage.get<Stored>('room');
  }

  private async send(w: WritableStreamDefaultWriter<Uint8Array>, chunk: string) {
    try {
      await w.write(enc.encode(chunk));
    } catch {
      this.drop(w);
    }
  }

  private drop(w: WritableStreamDefaultWriter<Uint8Array>) {
    if (!this.viewers.delete(w)) return;
    w.close().catch(() => {});
    if (this.viewers.size === 0 && this.ping) {
      clearInterval(this.ping);
      this.ping = undefined;
    }
    void this.broadcast(); // new viewer count
  }

  private async broadcast(room?: Stored | null) {
    const r = room ?? (await this.load());
    if (!r) return;
    const msg = `data: ${JSON.stringify({ state: r.state, updatedAt: r.updatedAt, viewers: this.viewers.size })}\n\n`;
    await Promise.all([...this.viewers].map((w) => this.send(w, msg)));
  }

  private async authorised(req: Request, room: Stored) {
    const m = /^Bearer\s+(.+)$/.exec(req.headers.get('Authorization') || '');
    return !!m && sameHash(await sha256(m[1].trim()), room.keyHash);
  }

  async alarm() {
    const room = await this.load();
    if (room && Date.now() - room.updatedAt < IDLE_TTL) {
      await this.ctx.storage.setAlarm(room.updatedAt + IDLE_TTL);
      return;
    }
    await this.ctx.storage.deleteAll();
  }

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname;

    if (path === '/init' && req.method === 'POST') {
      if (await this.load()) return json(409, { error: 'exists' });
      const { keyHash } = (await req.json()) as { keyHash: string };
      const now = Date.now();
      await this.ctx.storage.put('room', { keyHash, state: null, createdAt: now, updatedAt: now } satisfies Stored);
      await this.ctx.storage.setAlarm(now + IDLE_TTL);
      return json(201, { ok: true });
    }

    const room = await this.load();
    if (!room) return json(404, { error: 'No live draw with this code' });

    if (path === '/events' && req.method === 'GET') {
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const w = writable.getWriter();
      this.viewers.add(w);
      req.signal.addEventListener('abort', () => this.drop(w));
      if (!this.ping) {
        // Keeps proxies from closing idle streams and notices viewers who left.
        this.ping = setInterval(() => {
          for (const v of this.viewers) void this.send(v, ': ping\n\n');
        }, 20000);
      }
      void this.send(w, 'retry: 2000\n\n').then(() => this.broadcast(room));
      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }
    if (path === '/events') return json(405, { error: 'method not allowed' });

    if (req.method === 'GET') return json(200, { state: room.state, updatedAt: room.updatedAt, viewers: this.viewers.size });

    if (req.method === 'PUT') {
      if (!(await this.authorised(req, room))) return json(401, { error: 'Not allowed to publish to this room' });
      const len = Number(req.headers.get('Content-Length') || 0);
      if (len > MAX_BODY) return json(413, { error: 'Too large' });
      const text = await req.text();
      if (text.length > MAX_BODY) return json(413, { error: 'Too large' });
      let state: unknown;
      try {
        state = JSON.parse(text);
      } catch {
        return json(400, { error: 'Invalid JSON' });
      }
      const next: Stored = { ...room, state, updatedAt: Date.now() };
      await this.ctx.storage.put('room', next);
      await this.broadcast(next);
      return json(200, { ok: true, updatedAt: next.updatedAt, viewers: this.viewers.size });
    }

    if (req.method === 'DELETE') {
      if (!(await this.authorised(req, room))) return json(401, { error: 'Not allowed' });
      await this.broadcast({ ...room, state: { v: 1, live: false }, updatedAt: Date.now() });
      for (const w of this.viewers) w.close().catch(() => {});
      this.viewers.clear();
      if (this.ping) clearInterval(this.ping);
      this.ping = undefined;
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return json(200, { ok: true });
    }

    return json(405, { error: 'method not allowed' });
  }
}
