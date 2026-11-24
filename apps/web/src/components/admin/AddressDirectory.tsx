'use client';

import { useCallback, useEffect, useState } from 'react';
import { translator, type AddressImportStatus, type AddressSuggestion, type Locale } from '@zopf/shared';
import { AddressSearch, formatAddress } from '@/components/AddressSearch';
import { api, errorMessage } from '@/lib/client';
import { Button, inputClass, Notice } from './ui';

/** Import state of the address directory for the postal codes of one campaign, with a search to try. */
export function AddressDirectory({ locale, zipCodes }: { locale: Locale; zipCodes: string[] }) {
  const t = translator(locale);
  const [status, setStatus] = useState<AddressImportStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<AddressSuggestion | null>(null);

  const load = useCallback(async () => {
    const result = await api<AddressImportStatus>('/api/v1/admin/addresses/status');
    if (result.data) setStatus(result.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While an import runs, look again every two seconds.
  useEffect(() => {
    if (!status?.running) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [status?.running, load]);

  async function start() {
    setError(null);
    const result = await api('/api/v1/admin/addresses/import', 'POST', { zipCodes });
    if (!result.ok) setError(errorMessage(locale, result));
    await load();
  }

  const counts = new Map(status?.counts.map((c) => [c.zip, c.count]) ?? []);
  const missing = zipCodes.filter((zip) => !counts.get(zip));
  const last = status?.last;
  const when = (iso: string) => new Date(iso).toLocaleString(locale === 'de' ? 'de-CH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-xl font-bold">{t('addresses.title')}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('addresses.intro')}</p>

      {zipCodes.length === 0 ? (
        <Notice kind="error">{t('addresses.noZips')}</Notice>
      ) : (
        <>
          {zipCodes.length > 0 && (
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="text-zinc-500">{t('addresses.counts')}:</span>
              {zipCodes.map((zip) => (
                <span key={zip} className={`rounded-full px-2.5 py-0.5 ${counts.get(zip) ? 'bg-zinc-100 dark:bg-zinc-800' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'}`}>
                  {zip}: {(counts.get(zip) ?? 0).toLocaleString('de-CH')}
                </span>
              ))}
            </div>
          )}
          {missing.length > 0 && !status?.running && <p className="text-sm text-amber-700 dark:text-amber-400">{t('addresses.missingZip', { zips: missing.join(', ') })}</p>}

          {status?.running ? (
            <p role="status" className="flex items-center gap-2 text-sm">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              {t('addresses.running', { phase: status.phase ? t(`addresses.phase.${status.phase}`) : '' })}
            </p>
          ) : (
            <Button variant="primary" onClick={start}>
              {t('addresses.import', { zips: zipCodes.join(', ') })}
            </Button>
          )}
          {last && !status?.running && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {last.error
                ? t('addresses.failed', { error: last.error })
                : last.finishedAt && t('addresses.last', { date: when(last.finishedAt), imported: last.imported, removed: last.removed })}
            </p>
          )}
          {error && <Notice kind="error">{error}</Notice>}

          {(status?.counts.length ?? 0) > 0 && (
            <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <span className="text-sm font-medium">{t('addresses.try')}</span>
              <AddressSearch locale={locale} endpoint="/api/v1/admin/addresses/search" onSelect={setPicked} inputClassName={inputClass} />
              {picked && <p className="text-sm text-zinc-600 dark:text-zinc-400">✓ {formatAddress(picked)}</p>}
            </div>
          )}
          <p className="text-xs text-zinc-500">{t('addresses.source')}</p>
        </>
      )}
    </section>
  );
}
