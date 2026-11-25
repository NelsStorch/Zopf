import Link from 'next/link';
import { formatChf, formatDate, type AdminCampaignSummary, type BakeryReport } from '@zopf/shared';
import { StatusBadge } from '@/components/admin/ui';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';

export default async function AdminOverview() {
  const { locale, t } = await getI18n();
  const { data } = await serverApi<AdminCampaignSummary[]>('/api/v1/admin/campaigns');
  const open = data?.find((c) => c.status === 'OPEN') ?? null;
  const report = open ? (await serverApi<BakeryReport>(`/api/v1/admin/campaigns/${open.id}/bakery`)).data : null;
  const chf = (r: number) => `CHF ${formatChf(r, locale)}`;

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
        {report && (
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              [t('admin.overview.confirmed'), String(report.orders)],
              [t('admin.overview.pieces'), String(report.pieces)],
              [t('admin.overview.total'), chf(report.money.totalRappen), `${t('admin.overview.donations')} ${chf(report.money.donationRappen)}`],
              [t('admin.overview.outstanding'), chf(report.money.openRappen)],
            ].map(([label, value, sub]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
                <dd className="text-2xl font-bold tabular-nums">{value}</dd>
                {sub && <dd className="text-xs text-zinc-500">{sub}</dd>}
              </div>
            ))}
          </dl>
        )}
        {open && (
          <p className="mt-4 flex gap-4 text-sm">
            <Link className="underline" href={`/admin/aktionen/${open.id}/bestellungen`}>
              {t('orders.title')}
            </Link>
            <Link className="underline" href={`/admin/aktionen/${open.id}/backstube`}>
              {t('bakery.title')}
            </Link>
          </p>
        )}
      </div>
      <Link href="/admin/aktionen" className="inline-block rounded-lg bg-brand px-4 py-2 font-semibold text-on-brand">
        {t('admin.overview.toCampaigns')}
      </Link>
    </section>
  );
}
