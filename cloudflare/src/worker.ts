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
 *   GET    /api/rooms/:code/register   → { open, eventTitle }  registration form (phones)
 *   POST   /api/rooms/:code/register   → { code, name }        register: first name, last name, organization
 *   GET    /api/rooms/:code/registrations?after=n → { open, total, items }   (Authorization: Bearer <key>)
 *   PUT    /api/rooms/:code/registrations         → open / close registration { open } (Bearer <key>)
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
const MAX_REGS = 5000; // registrations per room
const MAX_FIELD = 60; // characters per name / organization

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

  const m = /^\/api\/rooms\/([A-Z0-9]{4,16})(\/events|\/register|\/registrations)?$/.exec(path);
  if (m) {
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    // Hand the request to the room; it answers itself (including the live stream).
    return stub.fetch(new Request(`https://room${m[2] ?? '/'}${url.search}`, req));
  }

  return json(404, { error: 'not found' });
}

/* -------------------------------------------------------- one live room */

type Stored = { keyHash: string; state: unknown; createdAt: number; updatedAt: number; regOpen?: boolean };
type Reg = { n: number; first: string; last: string; org: string; code: string; at: number };

/** "nimal" / "NIMAL" → "Nimal" (names typed in mixed case are kept as they are). */
const tidy = (v: string) =>
  v
    .split(' ')
    .map((w) => (w.length > 1 && (w === w.toLowerCase() || w === w.toUpperCase()) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');

/** First name, last name and organization only (nothing else is accepted or kept). */
function cleanReg(body: unknown): { reg?: Omit<Reg, 'n' | 'code' | 'at'>; error?: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const f = (v: unknown) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  const reg = { first: tidy(f(b.first)), last: tidy(f(b.last)), org: f(b.org) };
  if (!reg.first || !reg.last || !reg.org) return { error: 'Please fill in your first name, last name and organization.' };
  if (reg.first.length > MAX_FIELD || reg.last.length > MAX_FIELD || reg.org.length > MAX_FIELD) return { error: `Please keep each field under ${MAX_FIELD} characters.` };
  return { reg };
}
const regKey = (r: { first: string; last: string; org: string }) => `${r.first}|${r.last}|${r.org}`.toLowerCase();

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

  /**
   * Write to one viewer. A viewer who left (e.g. refreshed the page) may not be noticed at once,
   * and writing to its stream can then wait forever — so give up after a few seconds and drop it,
   * instead of holding up everyone else (and the big screen's next update).
   */
  private async send(w: WritableStreamDefaultWriter<Uint8Array>, chunk: string) {
    try {
      const ok = await Promise.race([
        w.write(enc.encode(chunk)).then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
      ]);
      if (!ok) this.drop(w);
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
    // `now` lets viewers line their clocks up with the big screen (see app/live/page.tsx).
    const msg = `data: ${JSON.stringify({ state: r.state, updatedAt: r.updatedAt, viewers: this.viewers.size, now: Date.now() })}\n\n`;
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

    if (path === '/register') {
      const brand = (room.state as { brand?: { eventTitle?: string; company?: string } } | null)?.brand;
      if (req.method === 'GET') return json(200, { open: !!room.regOpen, eventTitle: brand?.eventTitle, company: brand?.company });
      if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
      if (!room.regOpen) return json(403, { error: 'Registration is closed.' });
      const text = await req.text();
      if (text.length > 4096) return json(413, { error: 'Too large' });
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return json(400, { error: 'Invalid request' });
      }
      const { reg, error } = cleanReg(body);
      if (!reg) return json(400, { error });
      const regs = (await this.ctx.storage.get<Reg[]>('regs')) ?? [];
      const same = regs.find((r) => regKey(r) === regKey(reg));
      if (same) return json(200, { ok: true, existing: true, code: same.code, name: `${same.first} ${same.last}` });
      if (regs.length >= MAX_REGS) return json(409, { error: 'Registration is full.' });
      let code: string;
      do code = randomCode().slice(0, 6);
      while (regs.some((r) => r.code === code));
      regs.push({ n: regs.length + 1, ...reg, code, at: Date.now() });
      await this.ctx.storage.put('regs', regs);
      return json(201, { ok: true, code, name: `${reg.first} ${reg.last}` });
    }

    if (path === '/registrations') {
      if (!(await this.authorised(req, room))) return json(401, { error: 'Not allowed' });
      if (req.method === 'PUT') {
        let body: { open?: boolean };
        try {
          body = (await req.json()) as { open?: boolean };
        } catch {
          return json(400, { error: 'Invalid JSON' });
        }
        room.regOpen = !!body?.open;
        await this.ctx.storage.put('room', room);
      } else if (req.method !== 'GET') return json(405, { error: 'method not allowed' });
      const after = Number(new URL(req.url).searchParams.get('after')) || 0;
      const regs = (await this.ctx.storage.get<Reg[]>('regs')) ?? [];
      return json(200, { open: !!room.regOpen, total: regs.length, items: regs.filter((r) => r.n > after) });
    }

    if (req.method === 'GET') return json(200, { state: room.state, updatedAt: room.updatedAt, viewers: this.viewers.size, now: Date.now() });

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
      // Answer the big screen straight away; viewers are updated in the background.
      void this.broadcast(next);
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
