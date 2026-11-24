import Link from 'next/link';
import { formatDate, type AdminCampaignSummary, type MessageKey } from '@zopf/shared';
import { StatusBadge } from '@/components/admin/ui';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';

export default async function CampaignsPage() {
  const { locale, t } = await getI18n();
  const { data } = await serverApi<AdminCampaignSummary[]>('/api/v1/admin/campaigns');
  const campaigns = data ?? [];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('campaigns.title')}</h1>
        <Link href="/admin/aktionen/neu" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand">
          {t('campaigns.new')}
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t('campaigns.empty')}</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/aktionen/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <span className="font-semibold">{c.name}</span>
                <StatusBadge status={c.status} label={t(`status.${c.status}` as MessageKey)} />
                <span className="ml-auto text-sm text-zinc-500">
                  {t('campaigns.delivery', { date: formatDate(c.deliveryDate, locale, false) })} · {t('campaigns.orders', { count: c.orderCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
