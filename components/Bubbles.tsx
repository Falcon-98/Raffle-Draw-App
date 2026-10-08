'use client';

import { useEffect, useMemo, useState } from 'react';

/** Deterministic PRNG so a bubble keeps its place between renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HUES = [330, 265, 190, 42, 155, 12, 290, 210];

type Bubble = {
  name: string;
  left: number;
  top: number;
  hue: number;
  fs: number;
  dur: number;
  delay: number;
  pop: number;
  dx: number;
  dy: number;
};

/**
 * Floating participant-name bubbles for the pre-draw screen. Large lists are
 * shown in rotating "pages" so every name gets its moment on screen.
 */
export default function Bubbles({ names, visible }: { names: string[]; visible: boolean }) {
  const [max, setMax] = useState(40);
  const [vp, setVp] = useState('');
  const [page, setPage] = useState(0);
  const [lit, setLit] = useState(-1);

  useEffect(() => {
    const fit = () => {
      const w = window.innerWidth;
      setMax(w < 640 ? 14 : w < 1100 ? 28 : 42);
      setVp(`${w}x${window.innerHeight}`);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Shuffle once per list so pages are mixed, not alphabetical.
  const shuffled = useMemo(() => {
    const a = [...names];
    const r = mulberry32(names.length * 7919 + 13);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, [names]);

  const pages = Math.max(1, Math.ceil(shuffled.length / max));

  useEffect(() => {
    setPage(0);
  }, [pages]);

  useEffect(() => {
    if (pages <= 1 || !visible) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), 9000);
    return () => clearInterval(t);
  }, [pages, visible]);

  const bubbles = useMemo<Bubble[]>(() => {
    const slice = shuffled.slice(page * max, page * max + max);
    if (!slice.length || typeof window === 'undefined') return [];
    const W = window.innerWidth;
    const H = Math.max(200, window.innerHeight - 140);
    const small = W < 640;
    const r = mulberry32(page * 101 + slice.length);
    // Keep the centre (title + button) clear; elliptical zone in %.
    const clearX = small ? 70 : 27;
    const clearY = small ? 30 : 36;
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const out: Bubble[] = [];

    slice.forEach((name, i) => {
      const fs = (small ? 11 : 13) + r() * (small ? 4 : 7);
      const w = name.length * fs * 0.6 + fs * 2.4;
      const h = fs * 2.3;
      for (let tries = 0; tries < 60; tries++) {
        const x = w / 2 + r() * (W - w); // px centre
        const y = h / 2 + r() * (H - h);
        const px = (x / W) * 100;
        const py = (y / H) * 100;
        if (clearX && ((px - 50) / clearX) ** 2 + ((py - 50) / clearY) ** 2 < 1) continue;
        const pad = 14;
        if (placed.some((b) => Math.abs(b.x - x) < (b.w + w) / 2 + pad && Math.abs(b.y - y) < (b.h + h) / 2 + pad)) continue;
        placed.push({ x, y, w, h });
        out.push({
          name,
          left: px,
          top: py,
          hue: HUES[Math.floor(r() * HUES.length)],
          fs,
          dur: 7 + r() * 8,
          delay: -r() * 10,
          pop: out.length * 0.03,
          dx: 6 + r() * 12,
          dy: 5 + r() * 10,
        });
        break;
      }
    });
    return out;
  }, [shuffled, page, max, vp]);

  // Randomly spotlight one bubble at a time.
  useEffect(() => {
    if (!visible || !bubbles.length) return;
    const t = setInterval(() => setLit(Math.floor(Math.random() * bubbles.length)), 1100);
    return () => clearInterval(t);
  }, [bubbles.length, visible]);

  return (
    <div className={`bubbles${visible ? '' : ' hidden'}`} aria-hidden>
      <div className="bubble-page" key={`${page}-${max}-${shuffled.length}`}>
        {bubbles.map((b, i) => (
          <div
            key={`${b.name}-${i}`}
            className="bubble-wrap"
            style={
              {
                left: `${b.left}%`,
                top: `${b.top}%`,
                '--dur': `${b.dur}s`,
                '--delay': `${b.delay}s`,
                '--dx': `${b.dx}px`,
                '--dy': `${b.dy}px`,
              } as React.CSSProperties
            }
          >
            <span
              className={`bubble${i === lit ? ' lit' : ''}`}
              style={{ '--h': b.hue, '--fs': `${b.fs}px`, '--pop': `${b.pop}s` } as React.CSSProperties}
            >
              {b.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
