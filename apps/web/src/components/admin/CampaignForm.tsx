'use client';

import { type FormEvent, useState } from 'react';
import { translator, type AdminCampaign, type CampaignInput, type Locale } from '@zopf/shared';
import { api, errorMessage } from '@/lib/client';
import { Button, Field, inputClass, Notice } from './ui';

/** <input type="datetime-local"> value in the browser's time zone (the admins are in Switzerland). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const numberOrNull = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim().replace(',', '.');
  return text === '' ? null : Number(text);
};

const text = (form: FormData, name: string) => String(form.get(name) ?? '');

export function CampaignForm({
  locale,
  campaign,
  onSaved,
}: {
  locale: Locale;
  campaign: AdminCampaign | null;
  onSaved: (campaign: AdminCampaign) => void;
}) {
  const t = translator(locale);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const nextYear = new Date().getFullYear() + 1;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const deadline = text(form, 'orderDeadline');
    const input: CampaignInput = {
      name: text(form, 'name'),
      deliveryDate: text(form, 'deliveryDate'),
      deliveryTimeText: text(form, 'deliveryTimeText'),
      orderDeadline: deadline ? new Date(deadline).toISOString() : '',
      infoDe: text(form, 'infoDe'),
      infoEn: text(form, 'infoEn'),
      purposeDe: text(form, 'purposeDe'),
      purposeEn: text(form, 'purposeEn'),
      invoiceDueDays: Number(text(form, 'invoiceDueDays')),
      zipCodes: text(form, 'zipCodes')
        .split(/[\s,;]+/)
        .filter(Boolean),
      orderPrefix: text(form, 'orderPrefix'),
      depotLat: numberOrNull(form.get('depotLat')),
      depotLng: numberOrNull(form.get('depotLng')),
    };
    setBusy(true);
    setMessage(null);
    const result = campaign
      ? await api<AdminCampaign>(`/api/v1/admin/campaigns/${campaign.id}`, 'PUT', input)
      : await api<AdminCampaign>('/api/v1/admin/campaigns', 'POST', input);
    setBusy(false);
    if (result.ok && result.data) {
      setMessage({ kind: 'ok', text: t('campaign.saved') });
      onSaved(result.data);
    } else {
      setMessage({ kind: 'error', text: errorMessage(locale, result) });
    }
  }

  const section = 'space-y-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800';

  return (
    <form method="post" onSubmit={submit} className="space-y-6">
      <fieldset className={section}>
        <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">{t('campaign.sectionBasics')}</legend>
        <Field label={t('campaign.name')}>
          <input name="name" required maxLength={120} defaultValue={campaign?.name ?? `Zopfaktion ${nextYear}`} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('campaign.deliveryDate')}>
            <input name="deliveryDate" type="date" required defaultValue={campaign?.deliveryDate ?? ''} className={inputClass} />
          </Field>
          <Field label={t('campaign.deadline')}>
            <input
              name="orderDeadline"
              type="datetime-local"
              required
              defaultValue={campaign ? toLocalInput(campaign.orderDeadline) : ''}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label={t('campaign.deliveryTime')} hint={t('campaign.deliveryTimeHint')}>
          <input name="deliveryTimeText" maxLength={120} defaultValue={campaign?.deliveryTimeText ?? ''} className={inputClass} />
        </Field>
      </fieldset>

      <fieldset className={section}>
        <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">{t('campaign.sectionTexts')}</legend>
        <p className="text-xs text-zinc-500">{t('campaign.markdownHint')}</p>
        <div className="grid gap-4 md:grid-cols-2">
          {(['infoDe', 'infoEn', 'purposeDe', 'purposeEn'] as const).map((name) => (
            <Field key={name} label={t(`campaign.${name}`)}>
              <textarea name={name} rows={6} maxLength={10_000} defaultValue={campaign?.[name] ?? ''} className={inputClass} />
            </Field>
          ))}
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">{t('campaign.sectionArea')}</legend>
        <Field label={t('campaign.zipCodes')} hint={t('campaign.zipHint')}>
          <input name="zipCodes" defaultValue={campaign?.zipCodes.join(', ') ?? ''} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('campaign.prefix')} hint={t('campaign.prefixHint')}>
            <input
              name="orderPrefix"
              required
              maxLength={20}
              pattern="[A-Za-z0-9][A-Za-z0-9\-]{0,19}"
              defaultValue={campaign?.orderPrefix ?? `ZOPF-${nextYear}`}
              className={`${inputClass} uppercase`}
            />
          </Field>
          <Field label={t('campaign.dueDays')}>
            <input
              name="invoiceDueDays"
              type="number"
              min={0}
              max={120}
              required
              defaultValue={campaign?.invoiceDueDays ?? 30}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('campaign.depotLat')}>
            <input name="depotLat" inputMode="decimal" defaultValue={campaign?.depotLat ?? ''} className={inputClass} />
          </Field>
          <Field label={t('campaign.depotLng')}>
            <input name="depotLng" inputMode="decimal" defaultValue={campaign?.depotLng ?? ''} className={inputClass} />
          </Field>
        </div>
        <p className="text-xs text-zinc-500">{t('campaign.depotHint')}</p>
      </fieldset>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      <Button type="submit" variant="primary" disabled={busy}>
        {campaign ? t('campaign.save') : t('campaign.create')}
      </Button>
    </form>
  );
}
