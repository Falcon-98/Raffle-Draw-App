'use client';

import { useEffect, useState } from 'react';
import { BRAND, asset } from '@/lib/config';

/** The "Click" cursor mark — an arrow pointer with click ripples. */
export function ClickMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="cm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff3d8b" />
          <stop offset=".55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="#140f3a" stroke="rgba(255,255,255,.18)" />
      <g stroke="#ffc542" strokeWidth="3" strokeLinecap="round" opacity=".95">
        <path d="M16 13l3 4" />
        <path d="M10 22h5" />
        <path d="M26 9v5" />
      </g>
      <path
        d="M24 19 L47 40 L36.5 41.5 L42.5 53.5 L37 56 L31 43.5 L24 50 Z"
        fill="url(#cm-g)"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandBlock({ eventTitle, logo }: { eventTitle?: string; logo?: string }) {
  // An uploaded logo (admin → Display settings) wins over the one configured in lib/config.ts.
  const src = logo || (BRAND.logo ? asset(BRAND.logo) : null);
  return (
    <div className="brand">
      {src ? <img className="brand-logo" src={src} alt={BRAND.company} /> : <ClickMark />}
      <div className="brand-text">
        <span className="brand-company">{BRAND.company}</span>
        <span className="brand-event">{eventTitle || BRAND.event}</span>
      </div>
    </div>
  );
}

/** Aurora blobs, a perspective grid and twinkling sparks. */
export function Background() {
  const [sparks, setSparks] = useState<{ l: number; t: number; d: number }[]>([]);
  useEffect(() => {
    setSparks(Array.from({ length: 28 }, () => ({ l: Math.random() * 100, t: Math.random() * 100, d: Math.random() * 4 })));
  }, []);
  return (
    <div className="bg" aria-hidden>
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="grid" />
      {sparks.map((s, i) => (
        <span key={i} className="spark" style={{ left: `${s.l}%`, top: `${s.t}%`, animationDelay: `${s.d}s` }} />
      ))}
    </div>
  );
}
