'use client';

import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** Crisp, scalable QR code (SVG) for a link. */
export default function QrCode({ value, className, label }: { value: string; className?: string; label?: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [value]);
  return <div className={`qr ${className ?? ''}`} role="img" aria-label={label ?? `QR code for ${value}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
