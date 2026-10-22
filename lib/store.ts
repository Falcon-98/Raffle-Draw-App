'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND, DEFAULT_LIVE_SERVER, DEFAULT_PRIZES, NAME_COLOR_PRESETS } from './config';

/* ------------------------------------------------------------------ types */

export type Participant = {
  id: string;
  name: string; // shown on screen: first + last name
  first?: string;
  last?: string;
  ticket?: string; // Code
  group?: string; // Organization
  excluded?: boolean;
};

export type Winner = {
  id: string;
  participantId: string;
  name: string;
  first?: string;
  last?: string;
  ticket?: string; // Code
  group?: string; // Organization
  prize: string;
  at: string; // ISO time
  drawNo: number;
  pool: number; // eligible participants at the moment of the draw
  fingerprint: string; // hash of the eligible pool
  requestId?: string; // the admin draw request that produced it (de-duplicates multiple displays)
  forfeited?: boolean; // winner was not present; the prize was drawn again
};

export type Settings = {
  eventTitle: string;
  eventSubtitle: string;
  showBubbles: boolean;
  /** Name bubbles: all names are split evenly into this many sets that take turns on screen. */
  bubbleSets: number;
  /** Seconds each set of name bubbles stays on screen. */
  bubbleSeconds: number;
  /** "Now drawing", the prize and "Prize 1 of 3" above the event title on the welcome screen. */
  showPrize: boolean;
  /** The company logo + event name in the top-left corner of the display and the phone view. */
  showBrand: boolean;
  /** The "LIVE DRAW" pill in the top-right corner of the display. */
  showLiveBadge: boolean;
  removeWinners: boolean;
  sound: boolean;
  showWinnersBoard: boolean;
  spinSeconds: number;
  countdown: boolean; // 3-2-1 before the reel
  prizes: string[];
  /** How many of each prize there are. Missing = 1. */
  prizeQty: Record<string, number>;
  /** After the last of a prize is drawn, move on to the next prize that has some left. */
  autoAdvance: boolean;
  currentPrize: string;
  /** Company name shown above the event title (defaults to BRAND.company). */
  companyName: string;
  /** Optional company logo as a data URL (uploaded in the admin). */
  logo?: string;
  /** How the company is shown above the event title. */
  companyDisplay: CompanyDisplay;
  /** Event title on the welcome screen: the event logo, or the title as text. */
  titleDisplay: TitleDisplay;
  /** Optional uploaded event logo (data URL); without it the built-in one (BRAND.eventLogo) is used. */
  eventLogo?: string;
  /** Branding version these settings were saved with (moves older browsers to the eGuardian defaults once). */
  brandV?: number;
  /** Winner name colours, left → right (3 gradient stops). */
  nameColors: string[];
  /** Online live view (server/live-server.mjs). The room key only lives on this computer. */
  live: LiveSettings;
  /** Size, position, zoom and rotation of the display canvas (LED walls). */
  screen: ScreenSettings;
};

export type ScreenSettings = {
  mode: 'fit' | 'custom';
  width: number; // device pixels (as the LED processor / Windows display settings show them)
  height: number;
  x: number;
  y: number;
  scale: number; // content zoom, 1 = 100%
  rotate: 0 | 90 | 180 | 270;
  guides: boolean;
};

/** Size of the display window in device pixels (sent to the admin for the LED presets). */
export type WinInfo = { w: number; h: number; dpr: number };

export type LiveSettings = {
  server: string; // live server address, e.g. https://abc.trycloudflare.com
  password?: string; // only if the server sets LIVE_CREATE_TOKEN
  room?: { code: string; key: string };
  showQr: boolean; // show the join QR code on the big screen
  /** Registration by QR code is open (phones can add themselves to the draw). */
  register?: boolean;
  /** Last registration number already added to the participants (from the live server). */
  regSeen?: number;
  regRoom?: string; // the room `regSeen` belongs to
};

/** Full-screen QR code on the display: watch the draw live, or register for it. */
export type QrKind = 'live' | 'register';

export type CompanyDisplay = 'name' | 'logo' | 'both';
export type TitleDisplay = 'logo' | 'text';

const BRAND_V = 2;
/** Default prize lists of earlier versions: replaced by the current defaults while nothing has been drawn. */
const OLD_DEFAULT_PRIZES = [
  ['Grand Prize', '1st Prize', '2nd Prize', '3rd Prize', 'Special Gift'],
  ['Special Gift', '3rd Prize', '2nd Prize', '1st Prize', 'Grand Prize'],
].map((l) => l.join('|'));

export type RaffleState = {
  participants: Participant[];
  winners: Winner[];
  settings: Settings;
  updatedAt: number;
};

export type DisplayPhase = 'idle' | 'countdown' | 'spinning' | 'winner' | 'showcase';

export type Command =
  | { type: 'draw'; requestId?: string }
  | { type: 'reset-view' }
  | { type: 'confetti' }
  | { type: 'showcase' }
  | { type: 'qr'; show?: boolean; kind?: QrKind } // full-screen QR on the display (toggle when `show` is missing)
  | { type: 'status'; phase: DisplayPhase; at: number; win?: WinInfo }
  | { type: 'ping' };

/* --------------------------------------------------------------- defaults */

const KEY = 'click2026:raffle:v1';
const CHANNEL = 'click2026:raffle';

export const defaultScreen = (): ScreenSettings => ({
  mode: 'fit',
  width: 1920,
  height: 1080,
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
  guides: false,
});

export const defaultState = (): RaffleState => ({
  participants: [],
  winners: [],
  settings: {
    eventTitle: BRAND.event,
    eventSubtitle: BRAND.tagline,
    showBubbles: true,
    bubbleSets: 4,
    bubbleSeconds: 9,
    showPrize: false,
    showBrand: true,
    showLiveBadge: true,
    removeWinners: true,
    sound: true,
    showWinnersBoard: true,
    spinSeconds: 7,
    countdown: true,
    prizes: DEFAULT_PRIZES,
    prizeQty: {},
    autoAdvance: true,
    currentPrize: DEFAULT_PRIZES[0],
    companyName: BRAND.company,
    companyDisplay: 'logo',
    titleDisplay: 'logo',
    brandV: BRAND_V,
    nameColors: NAME_COLOR_PRESETS[0].colors,
    live: { server: DEFAULT_LIVE_SERVER, showQr: false },
    screen: defaultScreen(),
  },
  updatedAt: Date.now(),
});

/* --------------------------------------------------------------- storage */

export function loadState(): RaffleState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

/**
 * Accepts any saved state or backup file and returns a valid state: fills in new settings,
 * and also reads prizes saved as objects ({ id, name, qty } with currentPrizeId).
 */
export function migrate(parsed: Partial<RaffleState>): RaffleState {
  const d = defaultState();
  const raw = { ...(parsed.settings ?? {}) } as Partial<Settings> & Record<string, unknown>;
  let prizes = d.settings.prizes;
  let prizeQty = raw.prizeQty && typeof raw.prizeQty === 'object' ? { ...raw.prizeQty } : {};
  let currentPrize = typeof raw.currentPrize === 'string' ? raw.currentPrize : '';
  if (Array.isArray(raw.prizes)) {
    const objs = (raw.prizes as unknown[]).map((p, i) =>
      typeof p === 'string'
        ? { id: '', name: p, qty: prizeQty[p] ?? 1 }
        : {
            id: String((p as { id?: unknown }).id ?? ''),
            name: String((p as { name?: unknown }).name ?? `Prize ${i + 1}`),
            qty: Math.max(1, Math.floor(Number((p as { qty?: unknown }).qty) || 1)),
          },
    );
    prizes = [...new Set(objs.map((p) => p.name))];
    prizeQty = Object.fromEntries(objs.map((p) => [p.name, p.qty]));
    if (!currentPrize && typeof raw.currentPrizeId === 'string') currentPrize = objs.find((p) => p.id === raw.currentPrizeId)?.name ?? '';
  }
  delete raw.currentPrizeId;
  // Saved before the eGuardian branding: switch the untouched old defaults over, once.
  if ((raw.brandV ?? 0) < BRAND_V) {
    if (!raw.companyName || raw.companyName === 'Guardian') raw.companyName = d.settings.companyName;
    if (!raw.logo && (!raw.companyDisplay || raw.companyDisplay === 'name')) raw.companyDisplay = d.settings.companyDisplay;
    const winners = Array.isArray(parsed.winners) ? parsed.winners : [];
    if (!winners.length && OLD_DEFAULT_PRIZES.includes(prizes.join('|')) && !Object.keys(prizeQty).some((k) => prizeQty[k] !== 1)) {
      prizes = d.settings.prizes;
      prizeQty = {};
      currentPrize = prizes[0];
    }
    raw.brandV = BRAND_V;
  }
  return {
    participants: Array.isArray(parsed.participants) ? parsed.participants : [],
    winners: Array.isArray(parsed.winners) ? parsed.winners : [],
    settings: {
      ...d.settings,
      ...raw,
      prizes,
      prizeQty,
      currentPrize: currentPrize || prizes[0] || d.settings.currentPrize,
      live: { ...d.settings.live, ...(raw.live ?? {}), server: raw.live?.server || d.settings.live.server },
      screen: { ...defaultScreen(), ...(raw.screen ?? {}) },
    },
    updatedAt: parsed.updatedAt ?? Date.now(),
  };
}

let channel: BroadcastChannel | null = null;
function getChannel() {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL);
  return channel;
}

export function saveState(state: RaffleState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Could not save raffle state', e);
    alert('Could not save — the browser storage may be full or disabled.');
  }
}

export function sendCommand(cmd: Command) {
  getChannel()?.postMessage(cmd);
}

/* ----------------------------------------------------------------- hooks */

/** Shared raffle state, kept in localStorage and live-synced across tabs/windows. */
export function useRaffle() {
  const [state, setState] = useState<RaffleState | null>(null);

  useEffect(() => {
    setState(loadState());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) setState(loadState());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((fn: (s: RaffleState) => RaffleState) => {
    const next = { ...fn(loadState()), updatedAt: Date.now() };
    saveState(next);
    setState(next);
    return next;
  }, []);

  return { state, update };
}

/** Listen for commands from the other window (admin → display, display → admin). */
export function useCommands(onCommand: (cmd: Command) => void) {
  const ref = useRef(onCommand);
  ref.current = onCommand;
  useEffect(() => {
    const ch = getChannel();
    if (!ch) return;
    const listener = (e: MessageEvent<Command>) => ref.current(e.data);
    ch.addEventListener('message', listener);
    return () => ch.removeEventListener('message', listener);
  }, []);
}

/* --------------------------------------------------------------- helpers */

export function eligible(s: RaffleState): Participant[] {
  // A forfeited (not present) winner never comes back; real winners only leave when "one prize per person" is on.
  const out = new Set(s.winners.filter((w) => w.forfeited || s.settings.removeWinners).map((w) => w.participantId));
  return s.participants.filter((p) => !p.excluded && !out.has(p.id));
}

/** Winners that count (not forfeited). */
export const activeWinners = (s: RaffleState) => s.winners.filter((w) => !w.forfeited);

export const prizeQty = (s: RaffleState, prize: string) => Math.max(1, s.settings.prizeQty?.[prize] ?? 1);

/** How many of a prize are still to be drawn. */
export function prizeLeft(s: RaffleState, prize: string) {
  return prizeQty(s, prize) - s.winners.filter((w) => !w.forfeited && w.prize === prize).length;
}

/** All listed prizes together: how many winners in total, drawn so far and still to draw. */
export function prizeTotals(s: RaffleState) {
  let total = 0;
  let left = 0;
  for (const p of s.settings.prizes) {
    total += prizeQty(s, p);
    left += Math.max(0, prizeLeft(s, p));
  }
  return { total, left, drawn: total - left };
}

/**
 * Prizes are drawn from the top of the list down: the next prize is always the first one in the
 * list that still has places (e.g. 3rd → 2nd → 1st), whichever prize was drawn last.
 */
export function nextPrize(s: RaffleState): string | null {
  return s.settings.prizes.find((p) => prizeLeft(s, p) > 0) ?? null;
}

/** After the prize list changed: if the selected prize can't be drawn (any more), select the next one from the top. */
export function settlePrize(s: RaffleState): RaffleState {
  if (canDrawPrize(s) && s.settings.prizes.includes(s.settings.currentPrize)) return s;
  const np = nextPrize(s);
  return np ? { ...s, settings: { ...s.settings, currentPrize: np } } : s;
}

/** Can the current prize be drawn? Prizes not in the list (e.g. all removed) are unlimited. */
export const canDrawPrize = (s: RaffleState) =>
  !s.settings.prizes.includes(s.settings.currentPrize) || prizeLeft(s, s.settings.currentPrize) > 0;

export type Registration = { n: number; first: string; last: string; org: string; code: string; at: number };

/**
 * Adds people who registered by QR code to the participants. Safe to run again with the same
 * registrations (each one gets a fixed id), and skips anyone already on the list (same Code, or the
 * same name and organization, e.g. from the Excel sheet).
 */
export function addRegistrations(s: RaffleState, room: string, items: Registration[]): RaffleState {
  const live = s.settings.live;
  const seen = live.regRoom === room ? live.regSeen ?? 0 : 0;
  const fresh = items.filter((r) => r.n > seen);
  if (!fresh.length) return s;
  const have = new Set<string>();
  for (const p of s.participants) {
    have.add(p.id);
    if (p.ticket) have.add(`t:${norm(p.ticket)}`);
    have.add(`n:${norm(p.name)}|${norm(p.group ?? '')}`);
  }
  const added: Participant[] = [];
  for (const r of fresh) {
    const name = `${r.first} ${r.last}`.trim();
    const p: Participant = { id: `reg-${room}-${r.n}`, name, first: r.first, last: r.last, ticket: r.code, group: r.org };
    const keys = [p.id, `t:${norm(r.code)}`, `n:${norm(name)}|${norm(r.org)}`];
    if (keys.some((k) => have.has(k))) continue;
    keys.forEach((k) => have.add(k));
    added.push(p);
  }
  const regSeen = Math.max(seen, ...fresh.map((r) => r.n));
  return {
    ...s,
    participants: added.length ? [...s.participants, ...added] : s.participants,
    settings: { ...s.settings, live: { ...live, regSeen, regRoom: room } },
  };
}

export function uid() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return a[0].toString(36) + a[1].toString(36);
}

const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
export const participantKey = (p: Pick<Participant, 'name' | 'ticket'>) =>
  p.ticket ? `t:${norm(p.ticket)}` : `n:${norm(p.name)}`;
export const normalize = norm;

/** CSS gradient for the winner's name. */
export const nameGradient = (colors: string[] | undefined) => {
  const c = colors?.length ? colors : NAME_COLOR_PRESETS[0].colors;
  return `linear-gradient(100deg, ${(c.length > 1 ? c : [c[0], c[0]]).join(', ')})`;
};
