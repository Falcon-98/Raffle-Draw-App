#!/usr/bin/env node
/**
 * Live viewing server for the raffle — no database, no dependencies.
 *
 *  - Stores every live "room" in a JSON file (default: data/live.json).
 *  - The event laptop (the display window) publishes the current screen to a room.
 *  - Anyone with the room link watches it in real time (Server-Sent Events).
 *  - Optionally also serves the built site (./out), so one URL does everything.
 *
 *   npm run live                      # http://localhost:8787
 *   PORT=9000 npm run live
 *
 * Environment (all optional — see .env.example):
 *   PORT               port to listen on (default 8787)
 *   LIVE_DATA_FILE     JSON file to store rooms in (default data/live.json)
 *   LIVE_CREATE_TOKEN  if set, creating a room needs this password (admin → Live server password)
 *   ALLOWED_ORIGINS    comma-separated origins allowed to call the API (default: any)
 *   STATIC_DIR         folder with the built site to serve (default ./out if it exists)
 *
 * Registration by QR code: phones POST /api/rooms/:code/register (first name, last name,
 * organization) while the admin has registration open; the event laptop collects them with
 * GET /api/rooms/:code/registrations (room key) and adds them to the participants.
 */
import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8787);
const DATA_FILE = resolve(ROOT, process.env.LIVE_DATA_FILE || 'data/live.json');
const CREATE_TOKEN = process.env.LIVE_CREATE_TOKEN || '';
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const STATIC_DIR = resolve(ROOT, process.env.STATIC_DIR || 'out');
const SERVE_STATIC = existsSync(STATIC_DIR) && statSync(STATIC_DIR).isDirectory();

const MAX_BODY = 1024 * 1024; // 1 MB per published screen (the logo is the biggest part)
const MAX_ROOMS = 200;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const MAX_REGS = 5000; // registrations per room
const MAX_FIELD = 60; // characters per name / organization

/* ------------------------------------------------------------- storage */

/** @type {{ rooms: Record<string, { keyHash: string, state: unknown, createdAt: number, updatedAt: number }> }} */
let db = { rooms: {} };
try {
  db = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  if (!db || typeof db.rooms !== 'object') db = { rooms: {} };
} catch {
  /* first run */
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(DATA_FILE), { recursive: true });
      const tmp = `${DATA_FILE}.tmp`;
      writeFileSync(tmp, JSON.stringify(db));
      renameSync(tmp, DATA_FILE); // atomic: never leaves a half-written file
    } catch (e) {
      console.error('Could not save', DATA_FILE, e);
    }
  }, 200);
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function newCode() {
  for (;;) {
    const bytes = randomBytes(8);
    const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!db.rooms[code]) return code;
  }
}

/* ------------------------------------------------------- registration */

/** "nimal" / "NIMAL" → "Nimal" (names typed in mixed case are kept as they are). */
const tidy = (v) =>
  v
    .split(' ')
    .map((w) => (w.length > 1 && (w === w.toLowerCase() || w === w.toUpperCase()) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');

/** First name, last name and organization only (nothing else is accepted or kept). */
function cleanReg(body) {
  const f = (v) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  const reg = { first: tidy(f(body?.first)), last: tidy(f(body?.last)), org: f(body?.org) };
  if (!reg.first || !reg.last || !reg.org) return { error: 'Please fill in your first name, last name and organization.' };
  if (reg.first.length > MAX_FIELD || reg.last.length > MAX_FIELD || reg.org.length > MAX_FIELD) return { error: `Please keep each field under ${MAX_FIELD} characters.` };
  return { reg };
}
/** The phone's own random id (see app/register/page.tsx); only a salted hash of it is kept. */
const DEVICE_RE = /^[a-f0-9]{32}$/;
const regKey = (r) => `${r.first}|${r.last}|${r.org}`.toLowerCase();

/**
 * One registration per phone (unless the admin turned that off): a phone that already registered
 * gets its own registration back instead of a new one, whatever names it sends.
 */
function register(room, reg, dev) {
  room.regs ??= [];
  const mine = room.onePerDevice !== false && room.regs.find((r) => r.dev === dev);
  if (mine) return { status: 200, body: { ok: true, existing: true, device: true, code: mine.code, name: `${mine.first} ${mine.last}` } };
  const same = room.regs.find((r) => regKey(r) === regKey(reg));
  if (same) return { status: 200, body: { ok: true, existing: true, code: same.code, name: `${same.first} ${same.last}` } };
  if (room.regs.length >= MAX_REGS) return { status: 409, body: { error: 'Registration is full.' } };
  let code;
  do code = Array.from(randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  while (room.regs.some((r) => r.code === code));
  const r = { n: room.regs.length + 1, ...reg, code, at: Date.now(), dev };
  room.regs.push(r);
  return { status: 201, body: { ok: true, code, name: `${r.first} ${r.last}` } };
}

// A phone can't flood a room: a few registrations a minute per address.
const regHits = new Map();
function tooMany(req) {
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const hits = (regHits.get(ip) ?? []).filter((t) => now - t < 60000);
  hits.push(now);
  regHits.set(ip, hits);
  if (regHits.size > 10000) regHits.clear();
  return hits.length > 20;
}

/* -------------------------------------------------------- live viewers */

/** @type {Map<string, Set<http.ServerResponse>>} */
const watchers = new Map();
const viewerCount = (code) => watchers.get(code)?.size ?? 0;

function sendEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(code) {
  const room = db.rooms[code];
  const list = watchers.get(code);
  if (!room || !list) return;
  // `now` lets viewers line their clocks up with the big screen (see app/live/page.tsx).
  const msg = { state: room.state, updatedAt: room.updatedAt, viewers: list.size, now: Date.now() };
  for (const res of list) sendEvent(res, msg);
}

// Keep connections (and proxies/tunnels) alive.
setInterval(() => {
  for (const list of watchers.values()) for (const res of list) res.write(': ping\n\n');
}, 20000).unref();

/* ---------------------------------------------------------------- http */

function cors(req, res) {
  const origin = req.headers.origin;
  const ok = !origin || ALLOWED.length === 0 || ALLOWED.includes(origin);
  if (origin && ok) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Live-Token');
  res.setHeader('Access-Control-Max-Age', '600');
  // Lets an https page (GitHub Pages) reach a server on this laptop (Chrome "Private Network Access").
  if (req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true');
  return ok;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authorised(req, room) {
  const m = /^Bearer\s+(.+)$/.exec(req.headers.authorization || '');
  return !!m && sameHash(sha256(m[1].trim()), room.keyHash);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  } catch {
    return json(res, 400, { error: 'bad path' });
  }
  let file = join(STATIC_DIR, rel);
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep)) return json(res, 403, { error: 'forbidden' });
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(STATIC_DIR, '404.html');
  if (!existsSync(file)) return json(res, 404, { error: 'not found' });
  res.writeHead(file.endsWith('404.html') && !pathname.endsWith('404.html') ? 404 : 200, {
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    'Cache-Control': file.includes(`${sep}_next${sep}static${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  const path = url.pathname;
  const api = path.startsWith('/api/');

  if (api) {
    if (!cors(req, res)) return json(res, 403, { error: 'origin not allowed' });
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
  }

  try {
    // Health check (admin → "Test connection")
    if (path === '/api/health' && req.method === 'GET') {
      return json(res, 200, { ok: true, rooms: Object.keys(db.rooms).length, needsToken: !!CREATE_TOKEN });
    }

    // Create a room → { code, key }. The key is shown once and only its hash is stored.
    if (path === '/api/rooms' && req.method === 'POST') {
      if (CREATE_TOKEN && !sameHash(sha256(String(req.headers['x-live-token'] || '')), sha256(CREATE_TOKEN))) {
        return json(res, 401, { error: 'Wrong live server password' });
      }
      const codes = Object.keys(db.rooms);
      if (codes.length >= MAX_ROOMS) {
        // Make room by dropping the least recently updated one.
        codes.sort((a, b) => db.rooms[a].updatedAt - db.rooms[b].updatedAt);
        delete db.rooms[codes[0]];
      }
      const code = newCode();
      const key = randomBytes(24).toString('hex');
      const now = Date.now();
      db.rooms[code] = { keyHash: sha256(key), state: null, createdAt: now, updatedAt: now };
      save();
      return json(res, 201, { code, key });
    }

    const m = /^\/api\/rooms\/([A-Z0-9]{4,16})(\/events|\/register|\/registrations)?$/.exec(path);
    if (m) {
      const code = m[1];
      const room = db.rooms[code];
      if (!room) return json(res, 404, { error: 'No live draw with this code' });

      // Registration form (phones): is it open? / register
      if (m[2] === '/register') {
        const brand = room.state?.brand;
        if (req.method === 'GET') {
          const device = url.searchParams.get('device') || '';
          const mine = DEVICE_RE.test(device) && room.onePerDevice !== false ? (room.regs ?? []).find((r) => r.dev === sha256(`${code}:${device}`)) : null;
          return json(res, 200, {
            open: !!room.regOpen,
            onePerDevice: room.onePerDevice !== false,
            eventTitle: brand?.eventTitle,
            company: brand?.company,
            ...(mine ? { mine: { code: mine.code, name: `${mine.first} ${mine.last}` } } : {}),
          });
        }
        if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
        if (!room.regOpen) return json(res, 403, { error: 'Registration is closed.' });
        if (tooMany(req)) return json(res, 429, { error: 'Too many tries — please wait a minute.' });
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          return json(res, 400, { error: 'Invalid request' });
        }
        const { reg, error } = cleanReg(body);
        if (error) return json(res, 400, { error });
        if (!DEVICE_RE.test(String(body?.device ?? ''))) return json(res, 400, { error: 'Please reload the page and try again.' });
        const out = register(room, reg, sha256(`${code}:${body.device}`));
        if (out.status === 201) save();
        return json(res, out.status, out.body);
      }

      // Admin / display: open or close registration, and fetch new registrations
      if (m[2] === '/registrations') {
        if (!authorised(req, room)) return json(res, 401, { error: 'Not allowed' });
        if (req.method === 'PUT') {
          let body;
          try {
            body = JSON.parse(await readBody(req));
          } catch {
            return json(res, 400, { error: 'Invalid JSON' });
          }
          if (typeof body?.open === 'boolean') room.regOpen = body.open;
          if (typeof body?.onePerDevice === 'boolean') room.onePerDevice = body.onePerDevice;
          save();
        } else if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
        const after = Number(url.searchParams.get('after')) || 0;
        const regs = room.regs ?? [];
        return json(res, 200, {
          open: !!room.regOpen,
          onePerDevice: room.onePerDevice !== false,
          total: regs.length,
          items: regs.filter((r) => r.n > after).map(({ dev, ...r }) => r), // the device hash stays on the server
        });
      }

      // Live stream for viewers
      if (m[2] && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write('retry: 2000\n\n');
        if (!watchers.has(code)) watchers.set(code, new Set());
        watchers.get(code).add(res);
        broadcast(code); // send the current screen to the newcomer (and the new viewer count to everyone)
        req.on('close', () => {
          watchers.get(code)?.delete(res);
          broadcast(code);
        });
        return;
      }
      if (m[2]) return json(res, 405, { error: 'method not allowed' });

      // Current screen (also used as a fallback when streaming is blocked)
      if (req.method === 'GET') {
        return json(res, 200, { state: room.state, updatedAt: room.updatedAt, viewers: viewerCount(code), now: Date.now() });
      }

      // Publish (event laptop only)
      if (req.method === 'PUT') {
        if (!authorised(req, room)) return json(res, 401, { error: 'Not allowed to publish to this room' });
        let state;
        try {
          state = JSON.parse(await readBody(req));
        } catch (e) {
          return json(res, e.status || 400, { error: e.status === 413 ? 'Too large' : 'Invalid JSON' });
        }
        room.state = state;
        room.updatedAt = Date.now();
        save();
        broadcast(code);
        return json(res, 200, { ok: true, updatedAt: room.updatedAt, viewers: viewerCount(code) });
      }

      // Close the room for good
      if (req.method === 'DELETE') {
        if (!authorised(req, room)) return json(res, 401, { error: 'Not allowed' });
        room.state = { v: 1, live: false };
        room.updatedAt = Date.now();
        broadcast(code);
        for (const r of watchers.get(code) ?? []) r.end();
        watchers.delete(code);
        delete db.rooms[code];
        save();
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: 'method not allowed' });
    }

    if (api) return json(res, 404, { error: 'not found' });
    if (SERVE_STATIC && (req.method === 'GET' || req.method === 'HEAD')) return serveStatic(req, res, path);
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Raffle live server on http://localhost:${PORT}`);
  console.log(`  data file: ${DATA_FILE}`);
  console.log(`  site:      ${SERVE_STATIC ? `serving ${STATIC_DIR}` : 'not serving the site (no ./out — run "npm run build:local" first to include it)'}`);
  if (CREATE_TOKEN) console.log('  creating rooms needs the LIVE_CREATE_TOKEN password');
});
