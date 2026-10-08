'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { tick } from '@/lib/sound';

const AFTER = 3; // filler rows below the winner so the window never looks empty

/** Fast start, long suspenseful slow-down. */
const ease = (t: number) => 1 - Math.pow(1 - t, 4.5);

/**
 * A slot-machine style reel. The winner is decided BEFORE this component
 * mounts (and already saved); the reel only animates towards it.
 */
export default function Reel({
  pool,
  winnerName,
  durationMs,
  sound,
  onDone,
}: {
  pool: string[];
  winnerName: string;
  durationMs: number;
  sound: boolean;
  onDone: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const items = useMemo(() => {
    const count = Math.max(36, Math.round(durationMs / 85));
    const filler = () => (pool.length ? pool[Math.floor(Math.random() * pool.length)] : winnerName);
    const list: string[] = [];
    for (let i = 0; i < count; i++) {
      let n = filler();
      // Avoid showing the winner right before it lands (feels less suspicious).
      if (i > count - 6 && n === winnerName && pool.length > 1) n = filler();
      list.push(n);
    }
    list.push(winnerName);
    for (let i = 0; i < AFTER; i++) list.push(filler());
    return list;
  }, [pool, winnerName, durationMs]);

  const winIndex = items.length - 1 - AFTER;

  useEffect(() => {
    const track = trackRef.current;
    const reel = reelRef.current;
    if (!track || !reel) return;
    const first = track.firstElementChild as HTMLElement | null;
    const h = first?.getBoundingClientRect().height || 80;
    const total = winIndex * h;
    const startAt = performance.now();
    let raf = 0;
    let lastIdx = -1;
    let lastTick = 0;
    let lastPos = 0;

    const frame = (now: number) => {
      const t = Math.min(1, (now - startAt) / durationMs);
      const pos = ease(t) * total;
      // Rows are offset by 2 so row `i` sits in the centre window.
      track.style.transform = `translate3d(0, ${-(pos) + 2 * h}px, 0)`;
      const speed = Math.abs(pos - lastPos);
      lastPos = pos;
      track.style.filter = speed > h * 0.25 ? `blur(${Math.min(5, speed / h)}px)` : 'none';

      const idx = Math.floor(pos / h + 0.5);
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
        setDone(true);
        setTimeout(() => doneRef.current(), 650);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [items, winIndex, durationMs, sound]);

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
