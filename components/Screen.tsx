'use client';

import { ReactNode, useEffect, useState } from 'react';
import type { ScreenSettings } from '@/lib/store';

/**
 * Wraps the live display in a "canvas" that can be sized, positioned, zoomed and
 * rotated to match an LED wall. Width/height/offset are in device pixels — the
 * numbers an LED processor or Windows display settings show — and converted to
 * CSS pixels using the browser's devicePixelRatio (Windows scaling + zoom).
 *
 * In plain "fit" mode at 100 % with no rotation nothing is transformed, so phones
 * and normal screens behave exactly like a regular web page (scrolling included).
 */
export default function Screen({ cfg, children }: { cfg: ScreenSettings; children: ReactNode }) {
  const [win, setWin] = useState({ w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    const read = () => setWin({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 });
    read();
    window.addEventListener('resize', read);
    // devicePixelRatio changes when the window moves to a screen with different scaling
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener?.('change', read);
    return () => {
      window.removeEventListener('resize', read);
      mq.removeEventListener?.('change', read);
    };
  }, []);

  const scale = clamp(cfg.scale || 1, 0.25, 4);
  const rotate = cfg.rotate || 0;
  const plain = cfg.mode === 'fit' && scale === 1 && rotate === 0;

  // Same element tree in every mode (only styles change), so switching layouts
  // mid-draw never remounts the page or restarts the reel.
  const flat = plain || !win.w;
  const W = cfg.mode === 'custom' ? Math.max(100, cfg.width) / win.dpr : win.w;
  const H = cfg.mode === 'custom' ? Math.max(100, cfg.height) / win.dpr : win.h;
  const X = cfg.mode === 'custom' ? (cfg.x || 0) / win.dpr : 0;
  const Y = cfg.mode === 'custom' ? (cfg.y || 0) / win.dpr : 0;

  const turned = rotate === 90 || rotate === 270;
  const vw = (turned ? H : W) / scale; // the layout size the page "sees"
  const vh = (turned ? W : H) / scale;
  const t =
    rotate === 90
      ? `translate(${W}px, 0) rotate(90deg)`
      : rotate === 180
        ? `translate(${W}px, ${H}px) rotate(180deg)`
        : rotate === 270
          ? `translate(0, ${H}px) rotate(270deg)`
          : '';

  return (
    <div className={`screen-host${flat ? ' plain' : ''}`}>
      <div className="screen-box" style={flat ? undefined : { left: X, top: Y, width: W, height: H }}>
        <div
          className="screen-content"
          style={flat ? undefined : { width: vw, height: vh, transform: `${t} scale(${scale})`.trim(), transformOrigin: '0 0' }}
        >
          {children}
          {cfg.guides && win.w > 0 && (
            <Guides cfg={cfg} w={Math.round((flat ? win.w : W) * win.dpr)} h={Math.round((flat ? win.h : H) * win.dpr)} />
          )}
        </div>
      </div>
    </div>
  );
}

function Guides({ cfg, w, h }: { cfg: ScreenSettings; w: number; h: number }) {
  return (
    <div className="guides" aria-hidden>
      <span className="g-corner tl" />
      <span className="g-corner tr" />
      <span className="g-corner bl" />
      <span className="g-corner br" />
      <span className="g-cross" />
      <span className="g-label">
        {cfg.mode === 'custom' ? 'Custom canvas' : 'Fit window'} · {Math.round(w)} × {Math.round(h)} px
        {cfg.mode === 'custom' ? ` · offset ${cfg.x}, ${cfg.y}` : ''} · zoom {Math.round(cfg.scale * 100)}% · {cfg.rotate}°
      </span>
    </div>
  );
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
