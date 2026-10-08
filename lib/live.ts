'use client';

/**
 * Online live view: the display window publishes what is on the big screen to a small
 * JSON-file server (server/live-server.mjs); anyone with the room link watches it live
 * on their own device (app/live/page.tsx).
 */
import { useEffect, useRef, useState } from 'react';
import { asset } from './config';
import {
  type CompanyDisplay,
  type DisplayPhase,
  type RaffleState,
  type Winner,
  activeWinners,
  canDrawPrize,
  eligible,
  prizeLeft,
  prizeQty,
} from './store';

/* --------------------------------------------------------------- types */

export type LiveDraw = {
  id: string;
  name: string;
  ticket?: string;
  group?: string;
  prize: string;
  drawNo: number;
  pool: number;
  fingerprint: string;
  at: string;
  reel: string[]; // names the reel spins through (the winner is added by the reel itself)
  countdown: boolean;
  spinMs: number;
};

export type LiveWinner = { id: string; drawNo: number; name: string; ticket?: string; group?: string; prize: string };

export type LiveSnapshot = {
  v: 1;
  live: true;
  brand: { company: string; logo?: string; display: CompanyDisplay; eventTitle: string; eventSubtitle: string; nameColors: string[] };
  prize: { current: string; left: number; qty: number; ok: boolean };
  prizes: string[];
  counts: { entries: number; eligible: number; winners: number };
  fingerprint: string;
  winners: LiveWinner[];
  names: string[]; // a sample of names for the floating bubbles
  view: { phase: DisplayPhase; draw: LiveDraw | null };
};

export type LiveState = LiveSnapshot | { v: 1; live: false } | null;

export type LiveRoom = { code: string; key: string };

/* ------------------------------------------------------------ snapshot */

const MAX_REEL = 120;
const MAX_BUBBLES = 60;

/** Every n-th name, so the sample is spread over the list and stable between publishes. */
function spread(names: string[], max: number) {
  if (names.length <= max) return names;
  const step = names.length / max;
  return Array.from({ length: max }, (_, i) => names[Math.floor(i * step)]);
}

export function buildSnapshot(
  s: RaffleState,
  view: { phase: DisplayPhase; current: Winner | null; reelPool: string[]; fingerprint: string },
): LiveSnapshot {
  const pool = eligible(s);
  const won = activeWinners(s).sort((a, b) => a.drawNo - b.drawNo);
  const st = s.settings;
  const listed = st.prizes.includes(st.currentPrize);
  const c = view.current;
  const drawing = view.phase === 'countdown' || view.phase === 'spinning' || view.phase === 'winner';
  return {
    v: 1,
    live: true,
    brand: {
      company: st.companyName,
      logo: st.companyDisplay !== 'name' ? st.logo : undefined,
      display: st.companyDisplay,
      eventTitle: st.eventTitle,
      eventSubtitle: st.eventSubtitle,
      nameColors: st.nameColors,
    },
    prize: {
      current: st.currentPrize,
      left: listed ? prizeLeft(s, st.currentPrize) : 1,
      qty: listed ? prizeQty(s, st.currentPrize) : 1,
      ok: canDrawPrize(s),
    },
    prizes: st.prizes,
    counts: { entries: s.participants.length, eligible: pool.length, winners: won.length },
    fingerprint: view.fingerprint,
    // While the reel spins, keep the winner off the public board too.
    winners: won
      .filter((w) => !(c && w.id === c.id && (view.phase === 'countdown' || view.phase === 'spinning')))
      .map(({ id, drawNo, name, ticket, group, prize }) => ({ id, drawNo, name, ticket, group, prize })),
    names: spread(
      pool.map((p) => p.name),
      MAX_BUBBLES,
    ),
    view: {
      phase: view.phase,
      draw:
        c && drawing
          ? {
              id: c.id,
              name: c.name,
              ticket: c.ticket,
              group: c.group,
              prize: c.prize,
              drawNo: c.drawNo,
              pool: c.pool,
              fingerprint: c.fingerprint,
              at: c.at,
              reel: spread(view.reelPool, MAX_REEL),
              countdown: st.countdown,
              spinMs: st.spinSeconds * 1000,
            }
          : null,
    },
  };
}

/* ------------------------------------------------------------- server */

/** "abc.trycloudflare.com" → "https://abc.trycloudflare.com"; "localhost:8787" → "http://localhost:8787". */
export function normalizeServer(input: string) {
  let s = input.trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = (/^(localhost|127\.|\[::1\])/i.test(s) ? 'http://' : 'https://') + s;
  return s;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: 'no-store' });
  } catch {
    throw new Error('Cannot reach the live server. Check the address and that the server is running.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Live server error (${res.status})`);
  return body as T;
}

export const liveHealth = (server: string) => call<{ ok: boolean; needsToken: boolean }>(`${server}/api/health`);

export const liveCreateRoom = (server: string, password?: string) =>
  call<LiveRoom>(`${server}/api/rooms`, { method: 'POST', headers: password ? { 'X-Live-Token': password } : {} });

export const livePublish = (server: string, room: LiveRoom, state: LiveState) =>
  call<{ ok: boolean; viewers: number; updatedAt: number }>(`${server}/api/rooms/${room.code}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${room.key}` },
    body: JSON.stringify(state),
  });

export const liveGet = (server: string, code: string) =>
  call<{ state: LiveState; updatedAt: number; viewers: number }>(`${server}/api/rooms/${code}`);

export const liveClose = (server: string, room: LiveRoom) =>
  call<{ ok: boolean }>(`${server}/api/rooms/${room.code}`, { method: 'DELETE', headers: { Authorization: `Bearer ${room.key}` } });

/** The link the audience opens. The server address rides along unless it is this same site. */
export function viewerUrl(server: string, code: string) {
  const here = typeof window === 'undefined' ? '' : window.location.origin;
  const u = `${here}${asset('/live/')}?r=${code}`;
  return server && server !== here ? `${u}&s=${encodeURIComponent(server)}` : u;
}

/* ---------------------------------------------------------- publisher */

/**
 * Used by the display window: whenever what is on screen changes, send it to the live room.
 * Publishes go out one at a time and always carry the newest screen, so viewers can never
 * end up on an older one; failures are retried with back-off.
 */
export function useLivePublisher(
  state: RaffleState | null,
  view: { phase: DisplayPhase; current: Winner | null; reelPool: string[]; fingerprint: string },
) {
  const live = state?.settings.live;
  const server = live?.server ? normalizeServer(live.server) : '';
  const room = live?.room;
  const [status, setStatus] = useState<{ ok: boolean; at: number; error?: string } | null>(null);
  const lastSent = useRef('');
  const pending = useRef<{ sig: string; server: string; room: LiveRoom; snap: LiveSnapshot } | null>(null);
  const inflight = useRef(false);
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const snapshot = state && server && room ? buildSnapshot(state, view) : null;
  const sig = snapshot && room ? `${server}|${room.code}|${JSON.stringify(snapshot)}` : '';

  const flush = useRef(async () => {});
  flush.current = async () => {
    if (inflight.current || !pending.current) return;
    const job = pending.current;
    pending.current = null;
    inflight.current = true;
    try {
      await livePublish(job.server, job.room, job.snap);
      lastSent.current = job.sig;
      failures.current = 0;
      setStatus({ ok: true, at: Date.now() });
    } catch (e) {
      failures.current++;
      setStatus({ ok: false, at: Date.now(), error: e instanceof Error ? e.message : String(e) });
      if (!pending.current) pending.current = job; // nothing newer queued: retry this one
      clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => void flush.current(), Math.min(10000, 500 * 2 ** failures.current));
    } finally {
      inflight.current = false;
    }
    if (pending.current && failures.current === 0) void flush.current();
  };

  useEffect(() => {
    if (!snapshot || !room || sig === lastSent.current) return;
    pending.current = { sig, server, room, snap: snapshot };
    // Short debounce: merges bursts of setting edits; phase changes still go out at once.
    const t = setTimeout(() => void flush.current(), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  return status;
}
