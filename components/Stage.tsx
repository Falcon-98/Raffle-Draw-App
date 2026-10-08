'use client';

/* Pieces of the big-screen show shared by the display (/) and the online viewer (/live/). */
import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { nameGradient } from '@/lib/store';
import { tick } from '@/lib/sound';

const COLORS = ['#ff3d8b', '#8b5cf6', '#22d3ee', '#ffc542', '#34d399', '#ffffff'];

export function celebrate() {
  const end = Date.now() + 2600;
  confetti({ particleCount: 160, spread: 100, startVelocity: 55, origin: { y: 0.55 }, colors: COLORS, zIndex: 60 });
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors: COLORS, zIndex: 60 });
    confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors: COLORS, zIndex: 60 });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  setTimeout(() => {
    confetti({ particleCount: 90, spread: 360, startVelocity: 30, ticks: 120, origin: { x: 0.3, y: 0.3 }, shapes: ['star'], colors: ['#ffc542', '#fff3b0'], zIndex: 60 });
    confetti({ particleCount: 90, spread: 360, startVelocity: 30, ticks: 120, origin: { x: 0.7, y: 0.3 }, shapes: ['star'], colors: ['#ffc542', '#fff3b0'], zIndex: 60 });
  }, 700);
}

/** Letters spring in one by one; words never break mid-word; long names shrink to fit. */
export function WinnerName({ name, colors }: { name: string; colors?: string[] }) {
  const chars = Array.from(name);
  const n = chars.length;
  // Aim for one line inside the card; very long names wrap between words.
  const vw = Math.min(8, 96 / Math.max(n, 1));
  let idx = 0;
  return (
    <h2
      className="winner-name"
      aria-label={name}
      style={{ fontSize: `clamp(34px, ${vw.toFixed(2)}vw, 104px)`, '--name-grad': nameGradient(colors) } as React.CSSProperties}
    >
      {name.split(' ').map((word, wi, words) => (
        <span key={wi} className="word">
          {Array.from(word + (wi < words.length - 1 ? ' ' : '')).map((ch) => {
            const i = idx++;
            return (
              <motion.span
                key={i}
                className="ch"
                style={{
                  backgroundSize: `${n * 100}% 100%`,
                  backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 0}% 0`,
                }}
                initial={{ opacity: 0, y: 40, scale: 0.5 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.035, type: 'spring', stiffness: 260, damping: 14 }}
              >
                {ch}
              </motion.span>
            );
          })}
        </span>
      ))}
    </h2>
  );
}

/** Winners grouped by prize, in the order of the prize list (other prizes after). */
export function groupByPrize<W extends { prize: string; drawNo: number }>(ws: W[], order: string[]): [string, W[]][] {
  const map = new Map<string, W[]>();
  for (const p of order) map.set(p, []);
  for (const w of [...ws].sort((a, b) => a.drawNo - b.drawNo)) {
    if (!map.has(w.prize)) map.set(w.prize, []);
    map.get(w.prize)!.push(w);
  }
  return [...map].filter(([, list]) => list.length > 0);
}

/** Big 3-2-1 before the reel. The winner is already locked in; this is only suspense. */
export function Countdown({ sound, onDone }: { sound: boolean; onDone: () => void }) {
  const [n, setN] = useState(3);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (sound) tick(0.2);
    if (n === 0) {
      doneRef.current();
      return;
    }
    const t = setTimeout(() => setN((v) => v - 1), 900);
    return () => clearTimeout(t);
  }, [n, sound]);
  return (
    <div className="countdown" aria-live="assertive">
      <AnimatePresence mode="popLayout">
        {n > 0 && (
          <motion.span
            key={n}
            className="grad-text"
            initial={{ scale: 2.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          >
            {n}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
