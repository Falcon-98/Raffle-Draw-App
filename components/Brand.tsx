'use client';

import { useEffect, useState } from 'react';
import { BRAND, asset } from '@/lib/config';
import type { CompanyDisplay, TitleDisplay } from '@/lib/store';

/** The Click 2026 chevron mark. */
export function ClickMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <span className={className} aria-hidden>
      <img src={asset(BRAND.mark)} alt="" />
    </span>
  );
}

export function BrandBlock({
  eventTitle,
  company,
  logo,
  display = 'logo',
}: {
  eventTitle?: string;
  company?: string;
  logo?: string;
  display?: CompanyDisplay;
}) {
  // An uploaded logo (admin → Display settings) wins over the one configured in lib/config.ts.
  const src = logo || (BRAND.logo ? asset(BRAND.logo) : null);
  const name = (company ?? BRAND.company).trim();
  // Wide logos (wordmarks like EGUARDIAN) sit above the event title; square ones replace the mark.
  const [wide, setWide] = useState(!logo && !!BRAND.logo);
  const showLogo = !!src && display !== 'name';
  const showName = !!name && (display === 'name' || display === 'both' || !src); // no logo yet → fall back to the name
  const logoImg = showLogo && (
    <img
      className={wide ? 'brand-wordmark' : 'brand-logo'}
      src={src!}
      alt={name || 'Company logo'}
      onLoad={(e) => setWide(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight) > 2.5)}
    />
  );
  return (
    <div className="brand">
      {showLogo && !wide ? logoImg : <ClickMark />}
      <div className="brand-text">
        {showLogo && wide && logoImg}
        {showName && <span className="brand-company">{name}</span>}
        <span className="brand-event">{eventTitle || BRAND.event}</span>
      </div>
    </div>
  );
}

/** The event title on the welcome screen: the event logo (uploaded or built-in), or the title as text. */
export function EventTitle({ title, logo, show = 'logo' }: { title: string; logo?: string; show?: TitleDisplay }) {
  const src = logo || (BRAND.eventLogo ? asset(BRAND.eventLogo) : null);
  if (show === 'logo' && src) {
    return (
      <h1 className="title title-logo">
        <img src={src} alt={title} />
      </h1>
    );
  }
  return (
    <h1 className="title">
      <span className="grad-text">{title}</span>
    </h1>
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
