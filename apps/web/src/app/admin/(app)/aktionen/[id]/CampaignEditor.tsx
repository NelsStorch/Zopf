'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDate, translator, type AdminCampaign, type CampaignStatus, type Locale, type MessageKey } from '@zopf/shared';
import { AddressDirectory } from '@/components/admin/AddressDirectory';
import { CampaignForm } from '@/components/admin/CampaignForm';
import { DepotsEditor } from '@/components/admin/DepotsEditor';
import { ReminderPanel } from '@/components/admin/ReminderPanel';
import { ProductsEditor } from '@/components/admin/ProductsEditor';
import { Button, Notice, StatusBadge } from '@/components/admin/ui';
import { api, errorMessage } from '@/lib/client';

/** Which status changes the page offers from which status. */
const NEXT: Record<CampaignStatus, { to: CampaignStatus; label: MessageKey; primary?: boolean }[]> = {
  DRAFT: [{ to: 'OPEN', label: 'campaign.open', primary: true }],
  OPEN: [{ to: 'CLOSED', label: 'campaign.close', primary: true }],
  CLOSED: [
    { to: 'OPEN', label: 'campaign.open' },
    { to: 'ARCHIVED', label: 'campaign.archive' },
  ],
  ARCHIVED: [{ to: 'CLOSED', label: 'campaign.close' }],
};

export function CampaignEditor({ locale, initial, postalAddress }: { locale: Locale; initial: AdminCampaign; postalAddress: boolean }) {
  const t = translator(locale);
  const router = useRouter();
  const [campaign, setCampaign] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(status: CampaignStatus) {
    setBusy(true);
    setError(null);
    const result = await api<AdminCampaign>(`/api/v1/admin/campaigns/${campaign.id}/status`, 'PUT', { status });
    setBusy(false);
    if (result.ok && result.data) setCampaign(result.data);
    else setError(errorMessage(locale, result));
  }

  async function copy() {
    setBusy(true);
    const result = await api<AdminCampaign>(`/api/v1/admin/campaigns/${campaign.id}/copy`, 'POST');
    setBusy(false);
    if (result.ok && result.data) router.push(`/admin/aktionen/${result.data.id}`);
    else setError(errorMessage(locale, result));
  }

  async function remove() {
    if (!window.confirm(t('campaign.deleteConfirm'))) return;
    const result = await api(`/api/v1/admin/campaigns/${campaign.id}`, 'DELETE');
    if (result.ok) {
      router.push('/admin/aktionen');
      router.refresh();
    } else setError(errorMessage(locale, result));
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <StatusBadge status={campaign.status} label={t(`status.${campaign.status}` as MessageKey)} />
        </div>
        <p className="text-zinc-600 dark:text-zinc-400">
          {t('campaigns.delivery', { date: formatDate(campaign.deliveryDate, locale) })} ·{' '}
          <Link href={`/admin/aktionen/${campaign.id}/bestellungen`} className="underline">
            {t('campaigns.orders', { count: campaign.orderCount })}
          </Link>{' '}
          ·{' '}
          <Link href={`/admin/aktionen/${campaign.id}/backstube`} className="underline">
            {t('bakery.title')}
          </Link>{' '}
          ·{' '}
          <Link href={`/admin/aktionen/${campaign.id}/routen`} className="underline">
            {t('planning.title')}
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900">
          <span className="w-full text-sm text-zinc-600 dark:text-zinc-400 sm:w-auto sm:flex-1">{t(`campaign.statusHint.${campaign.status}` as MessageKey)}</span>
          {NEXT[campaign.status].map(({ to, label, primary }) => (
            <Button key={to} variant={primary ? 'primary' : 'secondary'} disabled={busy} onClick={() => setStatus(to)}>
              {t(label)}
            </Button>
          ))}
          {campaign.status !== 'DRAFT' && campaign.orderCount === 0 && (
            <Button variant="ghost" disabled={busy} onClick={() => setStatus('DRAFT')}>
              {t('campaign.toDraft')}
            </Button>
          )}
          <Button disabled={busy} onClick={copy}>
            {t('campaign.copy')}
          </Button>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
      </header>

      <ProductsEditor locale={locale} campaign={campaign} onChange={setCampaign} />

      <AddressDirectory locale={locale} zipCodes={campaign.zipCodes} />

      <DepotsEditor locale={locale} campaign={campaign} onChange={setCampaign} />

      <ReminderPanel locale={locale} campaignId={campaign.id} open={campaign.status === 'OPEN'} postalAddress={postalAddress} />

      <CampaignForm key={campaign.id} locale={locale} campaign={campaign} onSaved={setCampaign} />

      {campaign.orderCount === 0 && (
        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <Button variant="danger" onClick={remove}>
            {t('campaign.delete')}
          </Button>
        </div>
      )}
    </div>
  );
}
