import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatChf, type AdminCampaign, type AdminOrderRow } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';

/** All orders of a campaign. Payments, filters and exports follow with the next steps. */
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

      {orders.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t('orders.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">{t('orders.col.number')}</th>
                <th className="px-3 py-2">{t('orders.col.customer')}</th>
                <th className="px-3 py-2">{t('orders.col.items')}</th>
                <th className="px-3 py-2 text-right">{t('orders.col.total')}</th>
                <th className="px-3 py-2">{t('orders.col.payment')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {orders.map((o) => (
                <tr key={o.id} className={o.status === 'CONFIRMED' ? '' : 'text-zinc-400'}>
                  <td className="whitespace-nowrap px-3 py-2 align-top font-mono">
                    {o.number ?? '—'}
                    {o.status !== 'CONFIRMED' && (
                      <span className="block font-sans text-xs">{t(o.status === 'CANCELLED' ? 'orders.cancelled' : 'orders.pending')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="font-medium">{o.customerName}</span>
                    <span className="block">{o.address}</span>
                    <span className="block text-xs text-zinc-500">
                      {o.email}
                      {o.phone && ` · ${o.phone}`}
                    </span>
                    {(o.addressManual || !o.hasLocation) && (
                      <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                        {o.addressManual ? t('orders.manual') : ''}
                        {o.addressManual && !o.hasLocation ? ' · ' : ''}
                        {!o.hasLocation ? t('orders.noLocation') : ''}
                      </span>
                    )}
                    {o.notes && <span className="block text-xs italic">«{o.notes}»</span>}
                  </td>
                  <td className="px-3 py-2 align-top">{o.items}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">
                    {chf(o.totalRappen)}
                    {o.donationRappen > 0 && <span className="block text-xs text-zinc-500">♥ {chf(o.donationRappen)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    {t(o.paymentMethod === 'QR_INVOICE' ? 'orders.qr' : 'orders.onDelivery')}
                    <span className="block text-xs">{t(o.paymentStatus === 'PAID' ? 'orders.paid' : 'orders.open')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
