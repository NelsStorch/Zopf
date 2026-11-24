'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { translator, type Locale } from '@zopf/shared';
import { api, errorMessage } from '@/lib/client';

export function ConfirmOrder({ locale, token }: { locale: Locale; token: string }) {
  const t = translator(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    const result = await api<{ status: 'confirmed' | 'already'; accessToken?: string }>('/api/v1/public/orders/confirm', 'POST', { token });
    if (result.ok && result.data?.accessToken) {
      router.replace(`/bestellung/${result.data.accessToken}?neu=1`);
      return;
    }
    setBusy(false);
    setMessage(result.ok ? t('order.confirm.already') : errorMessage(locale, result));
  }

  if (message) {
    return (
      <p role="status" className="text-lg">
        {message}
      </p>
    );
  }

  return (
    <>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">{t('order.confirm.text')}</p>
      <button type="button" onClick={confirm} disabled={busy} className="rounded-xl bg-brand px-8 py-3 text-lg font-bold text-on-brand disabled:opacity-60">
        {t('order.confirm.button')}
      </button>
    </>
  );
}
