import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatChf, type AdminCampaign, type AdminOrderRow } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { OrdersTable } from '@/components/admin/OrdersTable';

/** All orders of a campaign: find, tick off payments, send reminders. */
export default async function OrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [{ data: campaign }, { data: orders }] = await Promise.all([
    serverApi<AdminCampaign>(`/api/v1/admin/campaigns/${id}`),
    serverApi<AdminOrderRow[]>(`/api/v1/admin/campaigns/${id}/orders`),
  ]);
  if (!campaign || !orders) notFound();
  const { locale, t } = await getI18n();
  const chf = (r: number) => `CHF ${formatChf(r, locale)}`;

  const confirmed = orders.filter((o) => o.status === 'CONFIRMED');
  const stats = t('orders.stats', {
    orders: confirmed.length,
    pieces: confirmed.reduce((s, o) => s + o.pieces, 0),
    total: chf(confirmed.reduce((s, o) => s + o.totalRappen, 0)),
    donations: chf(confirmed.reduce((s, o) => s + o.donationRappen, 0)),
  });

  return (
    <section className="space-y-5">
      <Link href={`/admin/aktionen/${campaign.id}`} className="text-sm text-zinc-500 hover:underline">
        ← {campaign.name}
      </Link>
      <h1 className="text-2xl font-bold">
        {t('orders.title')} · {campaign.name}
      </h1>
      <p className="rounded-xl bg-zinc-50 px-4 py-3 font-medium dark:bg-zinc-900">{stats}</p>

      {orders.length === 0 ? <p className="text-zinc-600 dark:text-zinc-400">{t('orders.empty')}</p> : <OrdersTable locale={locale} initial={orders} />}
    </section>
  );
}
