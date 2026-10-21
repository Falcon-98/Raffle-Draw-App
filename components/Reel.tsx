'use client';

import { useEffect, useRef, useState } from 'react';
import { tick } from '@/lib/sound';

const AFTER = 3; // filler rows below the winner so the window never looks empty

/** How long the winner's row takes to slide into the window at the end, whatever the spin time. */
const FINAL_MS = 700;
/** A spin that is re-timed (live viewer catching up) still has at least this long to go. */
const MIN_LEFT_MS = 1200;

/**
 * Where the reel is (in rows) `ms` into a spin of `durationMs` that lands on row `win`: a fast start
 * and a smooth slow-down onto the row before the winner, then the winner slides into the window in
 * the last FINAL_MS — the same short moment for any spin time, so its name can't be read early
 * (the rows outside the window are blurred). Both parts meet at the same speed: no stop-start.
 */
export function reelRow(ms: number, durationMs: number, win: number) {
  if (ms >= durationMs || win < 2) return ms >= durationMs || durationMs <= 0 ? win : (win * ms) / durationMs;
  const last = Math.min(FINAL_MS, durationMs * 0.3);
  const main = durationMs - last;
  if (ms >= main) {
    const v = (ms - main) / last; // last row: ease-out, starts at 2 rows per `last`
    return win - 1 + (1 - (1 - v) * (1 - v));
  }
  const u = ms / main;
  // k*u + (1-k)*(1-(1-u)^3): ends on row win-1 moving at exactly the final part's starting speed.
  const k = Math.min(1, (2 / last) * (main / (win - 1)));
  return (win - 1) * (k * u + (1 - k) * (1 - Math.pow(1 - u, 3)));
}

/**
 * The exact sequence of names the reel spins through, ending on the winner. Built once by the
 * display when a draw starts and also sent to the online live view, so every screen and every
 * phone shows the very same names (and a viewer who refreshes sees them again, not new ones).
 */
export function buildReel(pool: string[], winnerName: string, durationMs: number) {
  const count = Math.max(36, Math.round(durationMs / 85));
  const filler = () => (pool.length ? pool[Math.floor(Math.random() * pool.length)] : winnerName);
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    let n = filler();
    // Avoid showing the winner right before it lands (feels less suspicious).
    if (i > count - 6 && n === winnerName && pool.length > 1) n = filler();
    items.push(n);
  }
  items.push(winnerName);
  for (let i = 0; i < AFTER; i++) items.push(filler());
  return { items, winIndex: count };
}

/**
 * A slot-machine style reel. The winner is decided BEFORE this component
 * mounts (and already saved); the reel only animates towards it.
 * `startedAtMs` (epoch ms) makes it run in step with another screen — a live viewer joining
 * mid-spin, or re-syncing when the big screen's start time arrives; `onStart` reports when
 * it actually started (the display sends that to live viewers).
 */
export default function Reel({
  items,
  winIndex,
  durationMs,
  sound,
  onDone,
  startedAtMs,
  onStart,
}: {
  items: string[];
  winIndex: number;
  durationMs: number;
  sound: boolean;
  onDone: () => void;
  startedAtMs?: number | null;
  onStart?: (atMs: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const clearRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // performance.now() at which the spin began. Fixed when the reel appears (a re-render, e.g. sound
  // switched on, never restarts it) and only moved to follow a known start time from another screen.
  const startedAt = useRef<number | null>(null);
  const startRef = useRef(onStart);
  startRef.current = onStart;
  const elapsedFrom = (epoch: number | null | undefined) => (epoch ? Math.max(0, Date.now() - epoch) : 0);
  // After a timing correction the rest of the spin is re-planned from where the reel is (no jumps):
  // from row r0 at time t0, landing at time t1 (performance.now() clock).
  const plan = useRef<{ t0: number; r0: number; t1: number } | null>(null);
  const rowAt = (now: number) => {
    const p = plan.current;
    if (!p) return reelRow(now - (startedAt.current ?? now), durationMs, winIndex);
    return p.r0 + reelRow(now - p.t0, p.t1 - p.t0, winIndex - p.r0);
  };
  const endAt = () => plan.current?.t1 ?? (startedAt.current ?? 0) + durationMs;
  /** Land at `end`, smoothly from the current position, and never sooner than MIN_LEFT_MS from now. */
  const replan = (now: number, end: number) => {
    const r0 = rowAt(now);
    plan.current = { t0: now, r0, t1: Math.max(end, now + MIN_LEFT_MS) };
  };
  const finished = useRef(false);
  const winnerName = items[winIndex];

  useEffect(() => {
    const track = trackRef.current;
    const clear = clearRef.current;
    const reel = reelRef.current;
    if (!track || !clear || !reel) return;
    if (startedAt.current === null) {
      const skip = elapsedFrom(startedAtMs);
      startedAt.current = performance.now() - skip;
      startRef.current?.(Date.now() - skip);
      // Joining a spin in its last moment: still spin for a moment instead of landing at once.
      if (durationMs - skip < MIN_LEFT_MS) replan(performance.now(), startedAt.current + durationMs);
    }
    let raf = 0;
    let lastIdx = -1;
    let lastTick = 0;
    let lastRow = 0;
    const win = reel.querySelector('.reel-window') as HTMLElement | null;
    const first = track.firstElementChild as HTMLElement | null;
    // Rows above the centre window: 2 with 5 rows, 1 on short LED strips (3 rows). Layout sizes
    // (offsetTop/offsetHeight) ignore CSS transforms, so LED zoom/rotation can't skew it.
    const above = () => {
      const h = first?.offsetHeight;
      return win && h ? Math.round(win.offsetTop / h) : 2;
    };

    const frame = (now: number) => {
      const t = now >= endAt() ? 1 : Math.min(0.999, (now - (startedAt.current ?? now)) / durationMs);
      const row = t >= 1 ? winIndex : rowAt(now); // in rows; ends exactly on the winner
      // Move the strip by a percentage of its own height (all rows are the same height), so
      // nothing is measured in pixels: the reel's zoom-in transition, fractional row sizes
      // and resizing / full screen mid-spin can't make it stop on a different name.
      // Rows are offset by `above()` so row `i` sits in the centre window (re-read every frame,
      // so changing the LED layout mid-spin still lands on the winner).
      const y = `translate3d(0, ${((above() - row) / items.length) * 100}%, 0)`;
      track.style.transform = y;
      clear.style.transform = y; // the sharp copy inside the window moves in step
      const speed = Math.abs(row - lastRow);
      lastRow = row;
      // Rows outside the window are always blurred (unreadable, so the winner can't be read
      // coming up); the copy in the window only gets motion blur while it is fast.
      const motion = speed > 0.25 ? Math.min(5, speed) : 0;
      track.style.filter = `blur(${(first?.offsetHeight ?? 60) * 0.1 + motion}px)`;
      clear.style.filter = motion ? `blur(${motion}px)` : 'none';

      const idx = Math.floor(row + 0.5);
      if (idx !== lastIdx) {
        lastIdx = idx;
        if (sound && now - lastTick > 40) {
          tick(t);
          lastTick = now;
        }
      }
      if (t < 1) raf = requestAnimationFrame(frame);
      else {
        clear.style.filter = 'none';
        if (finished.current) return;
        finished.current = true;
        setDone(true);
        setTimeout(() => doneRef.current(), 650);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, winIndex, durationMs, sound]);

  // A better start time arrived (live viewer): line the landing up with it — by speeding up or
  // slowing down the rest of the spin, never by jumping (a jump could land on the winner at once).
  useEffect(() => {
    if (startedAt.current === null || !startedAtMs || finished.current) return;
    const now = performance.now();
    const end = now - elapsedFrom(startedAtMs) + durationMs;
    if (Math.abs(end - endAt()) > 120) replan(now, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAtMs]);

  return (
    <div ref={reelRef} className={`reel${done ? ' done' : ''}`} role="status" aria-live="polite">
      {/* Blurred, dimmed strip for the whole reel, and a sharp copy that only shows inside the window. */}
      <div ref={trackRef} className="reel-track back" aria-hidden>
        {items.map((n, i) => (
          <div key={i} className={`reel-item${i === winIndex ? ' win' : ''}`}>
            <span>{n}</span>
          </div>
        ))}
      </div>
      <div className="reel-clip" aria-hidden>
        <div ref={clearRef} className="reel-track">
          {items.map((n, i) => (
            <div key={i} className={`reel-item${i === winIndex ? ' win' : ''}`}>
              <span>{n}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="reel-window" />
      <span className="sr-only">{done ? `Winner: ${winnerName}` : 'Drawing…'}</span>
    </div>
  );
}
