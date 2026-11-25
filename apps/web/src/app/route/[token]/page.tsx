import { formatChf, formatDate, type DeliveryRoute } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';

export const metadata = { robots: { index: false }, referrer: 'no-referrer' as const };

/**
 * What the route link (QR code on the route sheet) opens. For now a read-only
 * list with navigation and phone; ticking off with offline sync follows.
 */
export default async function DeliveryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { locale, t } = await getI18n();
  const { data } = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? await serverApi<DeliveryRoute>(`/api/v1/public/routes/${token}`) : { data: null };

  if (!data) {
    return <p className="py-16 text-center text-lg">{t('delivery.invalid')}</p>;
  }
  const chf = (r: number) => `CHF ${formatChf(r, locale)}`;
  const pieces = data.stops.reduce((s, x) => s + x.pieces, 0);
  const collect = data.stops.reduce((s, x) => s + x.openRappen, 0);

  return (
    <section className="space-y-4 py-4">
      <header className="rounded-2xl p-5 text-white" style={{ background: data.route.color }}>
        <h1 className="text-2xl font-bold">{t('delivery.title', { name: data.route.name })}</h1>
        <p>
          {formatDate(data.campaign.deliveryDate, locale)}
          {data.campaign.deliveryTimeText && ` · ${data.campaign.deliveryTimeText}`}
        </p>
        <p className="font-semibold">
          {t('sheet.summary', { stops: data.stops.length, pieces })}
          {collect > 0 && ` · ${t('sheet.collectTotal', { amount: chf(collect) })}`}
        </p>
        {data.depot && (
          <p className="text-sm opacity-90">
            {t('sheet.start')}: {data.depot.name}, {data.depot.address}
          </p>
        )}
      </header>
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{t('delivery.comingSoon')}</p>

      <ol className="space-y-3">
        {data.stops.map((stop) => (
          <li key={stop.orderId} className="flex gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-white"
              style={{ background: data.route.color }}
            >
              {stop.seq}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-bold">{stop.address}</p>
              <p>{stop.customerName}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{stop.items}</p>
              {stop.notes && <p className="text-sm italic">«{stop.notes}»</p>}
              <p className={stop.openRappen > 0 ? 'font-bold' : 'text-sm text-zinc-500'}>
                {stop.openRappen === 0
                  ? t('sheet.paid')
                  : stop.paymentMethod === 'QR_INVOICE'
                    ? `${t('sheet.qrUnpaid')}: ${chf(stop.openRappen)}`
                    : t('sheet.collect', { amount: chf(stop.openRappen) })}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {stop.lat !== null && stop.lng !== null && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
                  >
                    {t('delivery.navigate')}
                  </a>
                )}
                {stop.phone && (
                  <a href={`tel:${stop.phone.replace(/[^+\d]/g, '')}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
                    {t('delivery.call')}
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
