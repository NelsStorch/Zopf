'use client';

import { type FormEvent, useState } from 'react';
import { translator, type Locale } from '@zopf/shared';
import { api, errorMessage } from '@/lib/client';

export function LostLink({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const [state, setState] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await api('/api/v1/public/orders/resend-link', 'POST', { email: new FormData(event.currentTarget).get('email'), locale });
    setBusy(false);
    setState(result.ok ? { kind: 'ok', text: t('order.lost.sent') } : { kind: 'error', text: errorMessage(locale, result) });
  }

  if (state?.kind === 'ok') return <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-green-900 dark:bg-green-950 dark:text-green-200">{state.text}</p>;

  return (
    <form method="post" onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('order.contact.email')}</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {state && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{state.text}</p>}
      <button type="submit" disabled={busy} className="rounded-xl bg-brand px-5 py-2.5 font-semibold text-on-brand disabled:opacity-60">
        {t('order.lost.submit')}
      </button>
    </form>
  );
}
