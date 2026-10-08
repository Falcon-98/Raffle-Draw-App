import type { Participant } from './store';

/**
 * Unbiased random integer in [0, max) using the browser's cryptographically
 * secure generator (Web Crypto). Rejection sampling removes modulo bias, so
 * every eligible participant has exactly the same chance.
 */
export function secureRandomInt(max: number): number {
  if (max <= 0) throw new Error('max must be > 0');
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

/**
 * A short fingerprint of the eligible pool, shown on screen before every draw.
 * Anyone holding the same list can recompute it — proof that nobody was quietly
 * added or removed between draws.
 */
export async function poolFingerprint(pool: Participant[]): Promise<string> {
  const text = pool
    .map((p) => `${p.ticket ?? ''}|${p.name}`.trim().toLowerCase())
    .sort()
    .join('\n');
  let hex: string;
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } else {
    // Non-secure context fallback (plain http on a LAN IP): FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex = h.toString(16).padStart(8, '0').repeat(2);
  }
  return hex.slice(0, 12).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
}
