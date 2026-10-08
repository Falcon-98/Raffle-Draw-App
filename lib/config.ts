/**
 * Branding & defaults. Edit this file to re-skin the raffle for another event.
 * Everything here can also be changed live from the admin panel (except the PIN).
 */
export const BRAND = {
  company: 'Guardian',
  event: 'Click 2026',
  tagline: 'Customer Appreciation Lucky Draw',
  /**
   * Optional logo. Put your file in /public (e.g. public/brand/logo.png) and set
   * logo: '/brand/logo.png'. Leave null to use the built-in "Click" wordmark.
   */
  logo: null as string | null,
};

/**
 * Admin PIN. On GitHub, set the repository secret ADMIN_PIN and the workflow injects it.
 * Note: on a static site this is a soft gate that keeps the audience out of the admin
 * screen, not real security — never put private data in the participant list.
 */
export const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || 'click2026';

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const asset = (p: string) => `${BASE_PATH}${p.startsWith('/') ? p : `/${p}`}`;

export const DEFAULT_PRIZES = ['Grand Prize', '1st Prize', '2nd Prize', '3rd Prize', 'Special Gift'];
