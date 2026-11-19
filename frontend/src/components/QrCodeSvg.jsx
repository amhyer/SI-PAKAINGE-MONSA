import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QrCodeSvg({ value, size = 148, label = 'QR Code Lacak Tiket' }) {
  const [svgMarkup, setSvgMarkup] = useState('');

  useEffect(() => {
    let active = true;
    if (!value) {
      setSvgMarkup('');
      return;
    }
    QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      width: size,
      color: { dark: '#0B2D52', light: '#FFFFFF' },
    })
      .then((svg) => {
        if (active) setSvgMarkup(svg);
      })
      .catch(() => {
        if (active) setSvgMarkup('');
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!svgMarkup) return null;

  return (
    <div
      className="inline-flex flex-col items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-xs"
      aria-label={label}
    >
      <div
        className="leading-none"
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      <span className="text-[9px] font-bold text-slate-500 mt-1">Pindai QR untuk Cek Balasan</span>
    </div>
  );
}
