import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconShield = (p: P) => (
  <svg {...base} {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
);
export const IconLock = (p: P) => (
  <svg {...base} {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const IconFinger = (p: P) => (
  <svg {...base} {...p}><path d="M12 11v3" /><path d="M8.5 7.5A5 5 0 0 1 17 11v2a12 12 0 0 1-1 5" /><path d="M7 11a5 5 0 0 1 .3-1.7" /><path d="M10 11a2 2 0 0 1 4 0v2a9 9 0 0 1-1.2 4.5" /><path d="M7 14.5c0 2 .5 3.5 1.3 5" /><path d="M4.5 9a8 8 0 0 1 14.6-1" /></svg>
);
export const IconUsers = (p: P) => (
  <svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18.5 14a6.5 6.5 0 0 1 3 6" /></svg>
);
export const IconTrophy = (p: P) => (
  <svg {...base} {...p}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3" /><path d="M7 5H4v2a3 3 0 0 0 3 3" /></svg>
);
export const IconGift = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9" /><path d="M12 8v13" /><path d="M12 8S10.5 3 8 3.5 6.5 8 12 8z" /><path d="M12 8s1.5-5 4-4.5S17.5 8 12 8z" /></svg>
);
export const IconExpand = (p: P) => (
  <svg {...base} {...p}><path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" /></svg>
);
export const IconSettings = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
export const IconUpload = (p: P) => (
  <svg {...base} {...p}><path d="M12 15V3" /><path d="M7 8l5-5 5 5" /><path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" /></svg>
);
export const IconDownload = (p: P) => (
  <svg {...base} {...p}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" /></svg>
);
export const IconClipboard = (p: P) => (
  <svg {...base} {...p}><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /></svg>
);
export const IconPencil = (p: P) => (
  <svg {...base} {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
);
export const IconPlay = (p: P) => (
  <svg {...base} {...p}><path d="M6 4l14 8-14 8V4z" fill="currentColor" /></svg>
);
export const IconTv = (p: P) => (
  <svg {...base} {...p}><rect x="2" y="5" width="20" height="13" rx="2" /><path d="M8 21h8" /></svg>
);
export const IconTrash = (p: P) => (
  <svg {...base} {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 15h10l1-15" /></svg>
);
export const IconUndo = (p: P) => (
  <svg {...base} {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
);
export const IconSparkle = (p: P) => (
  <svg {...base} {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></svg>
);
export const IconHome = (p: P) => (
  <svg {...base} {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>
);
export const IconWarn = (p: P) => (
  <svg {...base} {...p}><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5" /><path d="M12 18h.01" /></svg>
);
export const IconSearch = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
);
export const IconBan = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg>
);
export const IconLogout = (p: P) => (
  <svg {...base} {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
);
export const IconVolumeOff = (p: P) => (
  <svg {...base} {...p}><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M22 9l-6 6" /><path d="M16 9l6 6" /></svg>
);

/** Large golden trophy used on the winner card. */
export const Trophy = (p: P) => (
  <svg viewBox="0 0 96 96" aria-hidden {...p}>
    <defs>
      <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff3b0" />
        <stop offset=".45" stopColor="#ffc542" />
        <stop offset="1" stopColor="#ff7a59" />
      </linearGradient>
    </defs>
    <path d="M28 12h40v18c0 13-9 22-20 22S28 43 28 30V12z" fill="url(#tg)" />
    <path d="M28 18H16v6c0 9 6 14 14 14M68 18h12v6c0 9-6 14-14 14" fill="none" stroke="url(#tg)" strokeWidth="5" strokeLinecap="round" />
    <rect x="43" y="50" width="10" height="16" fill="url(#tg)" />
    <rect x="30" y="66" width="36" height="10" rx="3" fill="url(#tg)" />
    <rect x="24" y="76" width="48" height="8" rx="3" fill="#ff7a59" />
    <path d="M40 22l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7L30 29.5l7-.5 3-7z" fill="#fff" opacity=".85" transform="translate(8 0)" />
  </svg>
);
