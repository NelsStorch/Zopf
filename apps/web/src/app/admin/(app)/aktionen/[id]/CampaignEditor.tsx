'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDate, translator, type AdminCampaign, type CampaignStatus, type Locale, type MessageKey } from '@zopf/shared';
import { CampaignForm } from '@/components/admin/CampaignForm';
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

export function CampaignEditor({ locale, initial }: { locale: Locale; initial: AdminCampaign }) {
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
          {t('campaigns.delivery', { date: formatDate(campaign.deliveryDate, locale) })} · {t('campaigns.orders', { count: campaign.orderCount })}
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
