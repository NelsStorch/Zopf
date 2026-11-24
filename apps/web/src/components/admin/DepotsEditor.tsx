'use client';

import { type FormEvent, useState } from 'react';
import { translator, type AddressSuggestion, type AdminCampaign, type DepotInput, type Locale } from '@zopf/shared';
import { AddressSearch, formatAddress } from '@/components/AddressSearch';
import { api, errorMessage } from '@/lib/client';
import { Button, Field, inputClass, Notice } from './ui';

/** Start points of the routes: any number, each with a name and an address. */
export function DepotsEditor({ locale, campaign, onChange }: { locale: Locale; campaign: AdminCampaign; onChange: (c: AdminCampaign) => void }) {
  const t = translator(locale);
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState(false);
  const [picked, setPicked] = useState<AddressSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '');
    if (!manual && !picked) return setError(t('order.address.required'));
    const input: DepotInput = {
      name: text('name'),
      address: manual
        ? { kind: 'manual', street: text('street'), houseNumber: text('houseNumber'), zip: text('zip'), city: text('city') }
        : { kind: 'directory', addressId: picked!.id },
    };
    setBusy(true);
    setError(null);
    const result = await api<AdminCampaign>(`/api/v1/admin/campaigns/${campaign.id}/depots`, 'POST', input);
    setBusy(false);
    if (!result.ok || !result.data) return setError(errorMessage(locale, result));
    onChange(result.data);
    setAdding(false);
    setPicked(null);
    setManual(false);
  }

  async function remove(id: number) {
    if (!window.confirm(t('depots.deleteConfirm'))) return;
    const result = await api<AdminCampaign>(`/api/v1/admin/depots/${id}`, 'DELETE');
    if (result.ok && result.data) onChange(result.data);
    else setError(errorMessage(locale, result));
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t('depots.title')}</h2>
        {!adding && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            {t('depots.add')}
          </Button>
        )}
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('depots.intro')}</p>

      {campaign.depots.length === 0 && !adding && <p className="text-sm text-amber-700 dark:text-amber-400">{t('depots.empty')}</p>}
      <ul className="space-y-2">
        {campaign.depots.map((depot) => (
          <li key={depot.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">📍 {depot.name}</span>
              <span className="block text-sm text-zinc-600 dark:text-zinc-400">{formatAddress(depot)}</span>
              {depot.lat === null && <span className="block text-xs text-amber-700 dark:text-amber-400">{t('depots.noLocation')}</span>}
            </span>
            <Button variant="ghost" onClick={() => remove(depot.id)} aria-label={t('depots.delete')} title={t('depots.delete')}>
              ✕
            </Button>
          </li>
        ))}
      </ul>

      {adding && (
        <form method="post" onSubmit={submit} className="space-y-3 rounded-xl border border-brand p-4">
          <Field label={t('depots.name')}>
            <input name="name" required maxLength={80} placeholder={t('depots.namePlaceholder')} className={inputClass} />
          </Field>
          {manual ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_6rem_6rem_1fr]">
              <Field label={t('order.address.street')}>
                <input name="street" required minLength={2} maxLength={120} className={inputClass} />
              </Field>
              <Field label={t('order.address.number')}>
                <input name="houseNumber" maxLength={20} className={inputClass} />
              </Field>
              <Field label={t('order.address.zip')}>
                <input name="zip" required pattern="\d{4}" inputMode="numeric" className={inputClass} />
              </Field>
              <Field label={t('order.address.city')}>
                <input name="city" required minLength={2} maxLength={80} className={inputClass} />
              </Field>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-sm font-medium">{t('depots.address')}</span>
              {picked ? (
                <p className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900">✓ {formatAddress(picked)}</p>
              ) : (
                <AddressSearch locale={locale} endpoint="/api/v1/admin/addresses/search" onSelect={setPicked} inputClassName={inputClass} />
              )}
            </div>
          )}
          <button
            type="button"
            className="text-sm underline"
            onClick={() => {
              setManual(!manual);
              setPicked(null);
            }}
          >
            {manual ? t('depots.search') : t('depots.manual')}
          </button>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {t('common.save')}
            </Button>
            <Button
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}
      {!adding && error && <Notice kind="error">{error}</Notice>}
    </section>
  );
}
