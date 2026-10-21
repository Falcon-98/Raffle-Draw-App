/**
 * Branding & defaults. Edit this file to re-skin the raffle for another event.
 * Everything here can also be changed live from the admin panel (except the PIN).
 */
export const BRAND = {
  company: 'eGuardian',
  event: 'Click 2026',
  tagline: 'Customer Appreciation Lucky Draw',
  /** Organization logo (top-left of the display). A wide wordmark sits above the event title. Null = show the name. */
  logo: '/brand/eguardian-white.png' as string | null,
  /** Event logo, shown big on the welcome screen in place of the event title text. Null = show the title text. */
  eventLogo: '/brand/click-2026-white.png' as string | null,
  /** Small square mark (top-left, admin header, favicon is made from the same artwork). */
  mark: '/brand/click-mark-white.png',
};

/**
 * Admin PIN. On GitHub, set the repository secret ADMIN_PIN and the workflow injects it.
 * Note: on a static site this is a soft gate that keeps the audience out of the admin
 * screen, not real security — never put private data in the participant list.
 */
/**
 * Default live server for the online live view (the Cloudflare Worker in cloudflare/).
 * Override with NEXT_PUBLIC_LIVE_SERVER_URL at build time, or change it in Admin → Online live view.
 */
export const DEFAULT_LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL || 'https://raffle-live.inbox-ashen.workers.dev';

export const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || 'click2026';

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const asset = (p: string) => `${BASE_PATH}${p.startsWith('/') ? p : `/${p}`}`;

/** Prizes are drawn top to bottom: 3rd, then 2nd, and the 1st gift last for suspense. */
export const DEFAULT_PRIZES = ['3rd Gift', '2nd Gift', '1st Gift'];

/** Colour presets for the winner's name (left → right gradient). */
export const NAME_COLOR_PRESETS: { name: string; colors: string[] }[] = [
  { name: 'Aurora', colors: ['#ff3d8b', '#8b5cf6', '#22d3ee'] },
  { name: 'Gold', colors: ['#fff3b0', '#ffc542', '#ff9f1c'] },
  { name: 'Sunset', colors: ['#ffc542', '#ff7a59', '#ff3d8b'] },
  { name: 'Ocean', colors: ['#67e8f9', '#3b82f6', '#8b5cf6'] },
  { name: 'Emerald', colors: ['#d9f99d', '#34d399', '#10b981'] },
  { name: 'White', colors: ['#ffffff', '#ffffff', '#ffffff'] },
];
