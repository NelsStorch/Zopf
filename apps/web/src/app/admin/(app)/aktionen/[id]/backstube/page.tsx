import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDate, type BakeryReport } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { AutoRefresh } from '@/components/admin/AutoRefresh';

/** What the bakery has to make, live from the confirmed orders. Large type for the screen in the kitchen. */
export default async function BakeryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { data: report } = await serverApi<BakeryReport>(`/api/v1/admin/campaigns/${id}/bakery`);
  if (!report) notFound();
  const { locale, t } = await getI18n();

  return (
    <section className="space-y-6">
      <Link href={`/admin/aktionen/${report.campaign.id}`} className="text-sm text-zinc-500 hover:underline">
        ← {report.campaign.name}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {t('bakery.title')} · {report.campaign.name}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {formatDate(report.campaign.deliveryDate, locale)} · {t('bakery.orders', { count: report.orders })} · {t('bakery.pieces', { count: report.pieces })}
          </p>
          <p className="text-xs text-zinc-500">{t('bakery.intro')}</p>
        </div>
        <div className="flex gap-2">
          <AutoRefresh label={t('bakery.refresh')} seconds={30} />
          <a href={`/api/v1/admin/campaigns/${report.campaign.id}/bakery.pdf`} target="_blank" rel="noopener" className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-on-brand">
            {t('bakery.pdf')}
          </a>
        </div>
      </div>

      {report.orders === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">{t('bakery.empty')}</p>
      ) : (
        <>
          <div>
            <h2 className="mb-3 text-lg font-bold">{t('bakery.totals')}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {report.totals.map((line) => (
                <div key={`${line.sizeId}-${line.productName}-${line.sizeLabel}`} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {line.productName} {line.sizeLabel}
                  </p>
                  <p className="text-5xl font-bold tabular-nums">{line.quantity}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-bold">{t('bakery.byRoute')}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {report.routes.map((route) => (
                <div key={route.id ?? 'none'} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800" style={route.color ? { borderLeft: `6px solid ${route.color}` } : undefined}>
                  <p className="font-semibold">
                    {route.name ?? t('bakery.noRoute')}{' '}
                    <span className="font-normal text-zinc-500">
                      · {t('bakery.orders', { count: route.orders })} · {t('bakery.pieces', { count: route.pieces })}
                    </span>
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {route.lines.map((line) => (
                      <li key={`${line.sizeId}-${line.productName}-${line.sizeLabel}`} className="flex justify-between gap-3">
                        <span>
                          {line.productName} {line.sizeLabel}
                        </span>
                        <span className="font-bold tabular-nums">{line.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
