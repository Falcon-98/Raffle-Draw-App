'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND, DEFAULT_PRIZES } from './config';

/* ------------------------------------------------------------------ types */

export type Participant = {
  id: string;
  name: string;
  ticket?: string;
  group?: string;
  excluded?: boolean;
};

export type Winner = {
  id: string;
  participantId: string;
  name: string;
  ticket?: string;
  group?: string;
  prize: string;
  at: string; // ISO time
  drawNo: number;
  pool: number; // eligible participants at the moment of the draw
  fingerprint: string; // hash of the eligible pool
  requestId?: string; // the admin draw request that produced it (de-duplicates multiple displays)
};

export type Settings = {
  eventTitle: string;
  eventSubtitle: string;
  showBubbles: boolean;
  removeWinners: boolean;
  sound: boolean;
  showWinnersBoard: boolean;
  spinSeconds: number;
  prizes: string[];
  currentPrize: string;
};

export type RaffleState = {
  participants: Participant[];
  winners: Winner[];
  settings: Settings;
  updatedAt: number;
};

export type DisplayPhase = 'idle' | 'spinning' | 'winner';

export type Command =
  | { type: 'draw'; requestId?: string }
  | { type: 'reset-view' }
  | { type: 'confetti' }
  | { type: 'status'; phase: DisplayPhase; at: number }
  | { type: 'ping' };

/* --------------------------------------------------------------- defaults */

const KEY = 'click2026:raffle:v1';
const CHANNEL = 'click2026:raffle';

export const defaultState = (): RaffleState => ({
  participants: [],
  winners: [],
  settings: {
    eventTitle: BRAND.event,
    eventSubtitle: BRAND.tagline,
    showBubbles: true,
    removeWinners: true,
    sound: true,
    showWinnersBoard: true,
    spinSeconds: 7,
    prizes: DEFAULT_PRIZES,
    currentPrize: DEFAULT_PRIZES[0],
  },
  updatedAt: Date.now(),
});

/* --------------------------------------------------------------- storage */

export function loadState(): RaffleState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<RaffleState>;
    const d = defaultState();
    return {
      participants: Array.isArray(parsed.participants) ? parsed.participants : [],
      winners: Array.isArray(parsed.winners) ? parsed.winners : [],
      settings: { ...d.settings, ...(parsed.settings ?? {}) },
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch {
    return defaultState();
  }
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
  const won = new Set(s.winners.map((w) => w.participantId));
  return s.participants.filter((p) => !p.excluded && !(s.settings.removeWinners && won.has(p.id)));
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
