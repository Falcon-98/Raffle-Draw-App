import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BRAND, asset } from '@/lib/config';

export const metadata: Metadata = {
  title: `${BRAND.event} · Lucky Draw | ${BRAND.company}`,
  description: `${BRAND.company} ${BRAND.event} — live, fair and transparent customer lucky draw.`,
  icons: { icon: asset('/favicon.svg') },
};

export const viewport: Viewport = {
  themeColor: '#0a0820',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
