'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { translator, type Locale } from '@zopf/shared';

/** The club's TWINT code full screen, for the customer to scan at the door (made on the phone, also offline). */
export function TwintDialog({ locale, payload, amount, onClose }: { locale: Locale; payload: string; amount: string; onClose: () => void }) {
  const t = translator(locale);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 600 })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [payload]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={t('delivery.twintTitle')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 text-center text-zinc-900">
        <h2 className="text-xl font-bold">{t('delivery.twintTitle')}</h2>
        <p className="text-2xl font-bold">{t('delivery.twintAmount', { amount })}</p>
        {src && <img src={src} alt="TWINT QR" className="mx-auto w-full max-w-72" />}
        <button type="button" onClick={onClose} className="w-full rounded-xl bg-zinc-900 px-4 py-3 font-semibold text-white">
          {t('delivery.close')}
        </button>
      </div>
    </div>
  );
}
