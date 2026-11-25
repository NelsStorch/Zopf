'use client';

import { useState } from 'react';
import { translator, type Locale } from '@zopf/shared';
import { api, errorMessage } from '@/lib/client';

export function Unsubscribe({ locale, token }: { locale: Locale; token: string }) {
  const t = translator(locale);
  const [state, setState] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (state?.kind === 'ok') return <p role="status" className="text-lg">{state.text}</p>;

  return (
    <>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">{t('unsubscribe.text')}</p>
      <button
        type="button"
        disabled={busy}
        className="rounded-xl bg-brand px-8 py-3 text-lg font-bold text-on-brand disabled:opacity-60"
        onClick={async () => {
          setBusy(true);
          const result = await api('/api/v1/public/reminders/unsubscribe', 'POST', { token });
          setBusy(false);
          setState(result.ok ? { kind: 'ok', text: t('unsubscribe.done') } : { kind: 'error', text: errorMessage(locale, result) });
        }}
      >
        {t('unsubscribe.button')}
      </button>
      {state && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{state.text}</p>}
    </>
  );
}
