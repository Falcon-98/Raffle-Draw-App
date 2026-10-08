'use client';

import { useEffect, useRef, useState } from 'react';
import { tick } from '@/lib/sound';

const AFTER = 3; // filler rows below the winner so the window never looks empty

/** Fast start, long suspenseful slow-down. */
const ease = (t: number) => 1 - Math.pow(1 - t, 4.5);

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
  const finished = useRef(false);
  const winnerName = items[winIndex];

  useEffect(() => {
    const track = trackRef.current;
    const reel = reelRef.current;
    if (!track || !reel) return;
    if (startedAt.current === null) {
      const skip = elapsedFrom(startedAtMs);
      startedAt.current = performance.now() - skip;
      startRef.current?.(Date.now() - skip);
    }
    let raf = 0;
    let lastIdx = -1;
    let lastTick = 0;
    let lastRow = 0;

    const frame = (now: number) => {
      const t = Math.min(1, (now - (startedAt.current ?? now)) / durationMs);
      const row = t < 1 ? ease(t) * winIndex : winIndex; // position in rows; ends exactly on the winner
      // Move the strip by a percentage of its own height (all rows are the same height), so
      // nothing is measured in pixels: the reel's zoom-in transition, fractional row sizes
      // and resizing / full screen mid-spin can't make it stop on a different name.
      // Rows are offset by 2 so row `i` sits in the centre window.
      track.style.transform = `translate3d(0, ${((2 - row) / items.length) * 100}%, 0)`;
      const speed = Math.abs(row - lastRow);
      lastRow = row;
      track.style.filter = speed > 0.25 ? `blur(${Math.min(5, speed)}px)` : 'none';

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
        track.style.filter = 'none';
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

  // A better start time arrived (live viewer): move the running reel to match it.
  useEffect(() => {
    if (startedAt.current === null || !startedAtMs || finished.current) return;
    const target = performance.now() - elapsedFrom(startedAtMs);
    if (Math.abs(target - startedAt.current) > 120) startedAt.current = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAtMs]);

  return (
    <div ref={reelRef} className={`reel${done ? ' done' : ''}`} role="status" aria-live="polite">
      <div className="reel-window" />
      <div ref={trackRef} className="reel-track">
        {items.map((n, i) => (
          <div key={i} className={`reel-item${i === winIndex ? ' win' : ''}`}>
            <span>{n}</span>
          </div>
        ))}
      </div>
      <span className="sr-only">{done ? `Winner: ${winnerName}` : 'Drawing…'}</span>
    </div>
  );
}
