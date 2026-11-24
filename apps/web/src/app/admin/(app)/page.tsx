import Link from 'next/link';
import { formatDate, type AdminCampaignSummary } from '@zopf/shared';
import { StatusBadge } from '@/components/admin/ui';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';

export default async function AdminOverview() {
  const { locale, t } = await getI18n();
  const { data } = await serverApi<AdminCampaignSummary[]>('/api/v1/admin/campaigns');
  const open = data?.find((c) => c.status === 'OPEN') ?? null;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
      <div className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t('admin.overview.open')}</h2>
        {open ? (
          <Link href={`/admin/aktionen/${open.id}`} className="mt-2 block space-y-1 hover:underline">
            <span className="flex items-center gap-2 text-xl font-bold">
              {open.name} <StatusBadge status={open.status} label={t('status.OPEN')} />
            </span>
            <span className="block text-zinc-600 dark:text-zinc-400">
              {t('campaigns.delivery', { date: formatDate(open.deliveryDate, locale) })} · {t('campaigns.orders', { count: open.orderCount })}
            </span>
          </Link>
        ) : (
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">{t('admin.overview.none')}</p>
        )}
      </div>
      <p className="text-zinc-600 dark:text-zinc-400">{t('admin.dashboard.empty')}</p>
      <Link href="/admin/aktionen" className="inline-block rounded-lg bg-brand px-4 py-2 font-semibold text-on-brand">
        {t('admin.overview.toCampaigns')}
      </Link>
    </section>
  );
}
