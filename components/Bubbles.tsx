'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

/* ------------------------------------------------------------ measuring */

// Must match .bubble in globals.css: bold body font, 0.55em × 1.05em padding, 1px border.
const FONT = '"DM Sans", "Segoe UI", system-ui, -apple-system, sans-serif';
let ctx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, fs: number) {
  if (ctx === undefined) ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * fs * 0.6;
  ctx.font = `700 ${fs}px ${FONT}`;
  return ctx.measureText(text).width;
}
const bubbleSize = (name: string, fs: number) => ({ w: textWidth(name, fs) + fs * 2.1 + 2, h: fs * 1.3 + fs * 1.1 + 2 });

/* --------------------------------------------------------------- layout */

/** A rectangle to keep bubbles off (title, stats, button, winners board), in the bubbles' own px. */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Places EVERY name of a set, without overlaps and away from the centre (title + button).
 * If the set does not fit, the bubbles get smaller and the layout is tried again; only as a
 * last resort a bubble goes to the least crowded spot (so no name is ever left out).
 */
export function layoutBubbles(names: string[], W: number, H: number, seed: number, avoid: Rect[] = []): Bubble[] {
  if (!names.length || W < 50 || H < 50) return [];
  const small = W < 640;
  const short = H < 520; // LED strips: keep bubbles to the sides
  const base = small ? 11 : 13; // font size range: base … base + spread
  const spread = small ? 4 : 7;
  const pad = 12; // gap between bubbles (they drift a few px)
  const edge = 6; // keep clear of the canvas edge

  // Longest names first: big bubbles are hardest to place.
  const order = names.map((name, i) => ({ name, i, k: mulberry32(seed + i * 31)() })).sort((a, b) => b.name.length - a.name.length);

  const attempt = (scale: number, zone: number, force: boolean) => {
    const r = mulberry32(seed);
    // The real title / stats / button when known (measured on the page), else an oval in the middle.
    const clearX = (small ? 70 : short ? 24 : 27) * zone;
    const clearY = (small ? 30 : short ? 70 : 36) * zone;
    const m = 16 * zone; // margin around the title & co.
    const inCentre = avoid.length
      ? (x: number, y: number, w: number, h: number) =>
          avoid.some((a) => x + w / 2 > a.x - m && x - w / 2 < a.x + a.w + m && y + h / 2 > a.y - m && y - h / 2 < a.y + a.h + m)
      : (x: number, y: number) => ((x / W * 100 - 50) / clearX) ** 2 + ((y / H * 100 - 50) / clearY) ** 2 < 1;
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const out: (Bubble | null)[] = new Array(names.length).fill(null);
    const overlap = (x: number, y: number, w: number, h: number) =>
      placed.reduce((sum, b) => {
        const ox = (b.w + w) / 2 + pad - Math.abs(b.x - x);
        const oy = (b.h + h) / 2 + pad - Math.abs(b.y - y);
        return ox > 0 && oy > 0 ? sum + ox * oy : sum;
      }, 0);

    for (const { name, i, k } of order) {
      const fs = Math.max(9, (base + k * spread) * scale);
      const { w, h } = bubbleSize(name, fs);
      if (w + 2 * edge > W || h + 2 * edge > H) {
        if (!force) return null;
      }
      let best: { x: number; y: number; cost: number } | null = null;
      for (let t = 0; t < 300; t++) {
        const x = w / 2 + edge + r() * Math.max(0, W - w - 2 * edge);
        const y = h / 2 + edge + r() * Math.max(0, H - h - 2 * edge);
        const cost = (inCentre(x, y, w, h) ? 1e9 : 0) + overlap(x, y, w, h);
        if (!best || cost < best.cost) best = { x, y, cost };
        if (cost === 0) break;
      }
      if (!best || (best.cost > 0 && !force)) return null;
      placed.push({ x: best.x, y: best.y, w, h });
      out[i] = {
        name,
        left: (best.x / W) * 100,
        top: (best.y / H) * 100,
        hue: HUES[Math.floor(r() * HUES.length)],
        fs,
        dur: 7 + r() * 8,
        delay: -r() * 10,
        pop: 0,
        dx: 4 + r() * 8,
        dy: 3 + r() * 6,
      };
    }
    // Pop in a random-looking order (the shuffled set order), not longest first.
    return out.map((b, n) => ({ ...b!, pop: n * 0.03 }));
  };

  for (const zone of [1, 0.85, 0.7]) {
    for (let scale = 1; scale >= 0.5; scale -= 0.07) {
      const res = attempt(scale, zone, false);
      if (res) return res;
    }
  }
  return attempt(0.5, 0.7, true)!;
}

/** Splits names into `sets` groups whose sizes differ by at most one (dealt round-robin). */
export function splitSets(names: string[], sets: number): string[][] {
  const n = Math.max(1, Math.min(Math.round(sets) || 1, names.length || 1));
  const out: string[][] = Array.from({ length: n }, () => []);
  names.forEach((name, j) => out[j % n].push(name));
  return out;
}

/* ------------------------------------------------------------ component */

/**
 * Floating participant-name bubbles for the pre-draw screen. All names are shuffled once and
 * dealt evenly into `sets` groups that take turns on screen (`seconds` each), so every name is
 * shown in every round. Without `sets` the group size follows the screen size (phones).
 */
export default function Bubbles({ names, visible, sets, seconds = 9 }: { names: string[]; visible: boolean; sets?: number; seconds?: number }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [fontsReady, setFontsReady] = useState(0);
  const [avoid, setAvoid] = useState<Rect[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [lit, setLit] = useState(-1);

  // Size from our own box (not the window) so it follows the LED canvas.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    // Measure again with the real web font once it has loaded.
    void document.fonts?.ready.then(() => setFontsReady((v) => v + 1));
    return () => ro.disconnect();
  }, []);

  // Shuffle once per list so sets are mixed, not alphabetical.
  const shuffled = useMemo(() => {
    const a = [...names];
    const r = mulberry32(names.length * 7919 + 13);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, [names]);

  const groups = useMemo(() => {
    let n = sets;
    if (!n) {
      // Automatic (online live view): about as many as fit comfortably on this screen.
      const area = (box.w * box.h) / 1e6;
      const max = Math.max(10, Math.min(90, Math.round(box.w < 640 ? 14 : 22 + area * 18)));
      n = Math.ceil(shuffled.length / max);
    }
    return splitSets(shuffled, n);
  }, [shuffled, sets, box]);

  const pages = groups.length;
  useEffect(() => {
    setPage((p) => (p < pages ? p : 0));
  }, [pages]);

  useEffect(() => {
    if (pages <= 1 || !visible) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), Math.max(2, seconds) * 1000);
    return () => clearInterval(t);
  }, [pages, visible, seconds]);

  // Where the title, stats, button and winners board are, so bubbles never cover them. Measured
  // from the layout (offsetLeft/Top), which LED zoom/rotation and entry animations don't affect.
  useEffect(() => {
    const el = ref.current;
    const stage = el?.closest('.stage');
    if (!el || !stage || !visible) return;
    const pos = (e: HTMLElement) => {
      let x = 0;
      let y = 0;
      for (let n: HTMLElement | null = e; n && n !== stage; n = n.offsetParent as HTMLElement | null) {
        x += n.offsetLeft;
        y += n.offsetTop;
      }
      return { x, y };
    };
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const o = pos(el);
        const rects = [...stage.querySelectorAll<HTMLElement>('.hero > *, .board')]
          .filter((e) => e.offsetWidth && e.offsetHeight)
          .map((e) => {
            const p = pos(e);
            return { x: p.x - o.x, y: p.y - o.y, w: e.offsetWidth, h: e.offsetHeight };
          });
        setAvoid((prev) => (JSON.stringify(prev) === JSON.stringify(rects) ? prev : rects));
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    stage.querySelectorAll('.stage-body, .hero, .hero > *').forEach((e) => ro.observe(e));
    // The hero is replaced when the screen comes back to the welcome view: watch for that too.
    const mo = new MutationObserver(() => {
      ro.disconnect();
      stage.querySelectorAll('.stage-body, .hero, .hero > *').forEach((e) => ro.observe(e));
      measure();
    });
    const body = stage.querySelector('.stage-body');
    if (body) mo.observe(body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [visible, box, fontsReady]);

  const set = groups[page] ?? groups[0] ?? [];
  const bubbles = useMemo<Bubble[]>(
    () => (box.w ? layoutBubbles(set, box.w, Math.max(120, box.h), page * 101 + set.length, avoid) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, box, page, fontsReady, avoid],
  );

  // Randomly spotlight one bubble at a time.
  useEffect(() => {
    if (!visible || !bubbles.length) return;
    const t = setInterval(() => setLit(Math.floor(Math.random() * bubbles.length)), 1100);
    return () => clearInterval(t);
  }, [bubbles.length, visible]);

  return (
    <div ref={ref} className={`bubbles${visible ? '' : ' hidden'}`} aria-hidden data-set={page + 1} data-sets={pages}>
      <div className="bubble-page" key={`${page}-${pages}-${shuffled.length}`}>
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
