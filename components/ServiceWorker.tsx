'use client';

import { useEffect } from 'react';
import { asset } from '@/lib/config';

const CACHE = 'click2026-raffle-v1'; // keep in sync with public/sw.js

/** Registers public/sw.js so the site keeps working offline once it has been opened. */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register(asset('/sw.js'), { scope: asset('/') })
      .then(() => navigator.serviceWorker.ready)
      .then(async () => {
        // Files this page loaded before the worker was active (first visit) are not in its cache yet.
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => {
            const { origin, hostname } = new URL(u);
            return origin === location.origin || hostname === 'fonts.googleapis.com' || hostname === 'fonts.gstatic.com';
          });
        const cache = await caches.open(CACHE);
        await Promise.all(urls.map((u) => cache.match(u).then((hit) => (hit ? undefined : cache.add(u))).catch(() => {})));
      })
      .catch(() => {});
  }, []);
  return null;
}
