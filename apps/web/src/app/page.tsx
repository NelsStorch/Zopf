import Link from 'next/link';
import { formatChf, formatDate, type PublicCampaign } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getBrand } from '@/lib/brand';
import { getI18n } from '@/lib/i18n';

/** HTML rendered and sanitised by the backend from the campaign's Markdown (lib/markdown.ts). */
function Rendered({ html }: { html: string }) {
  return (
    <div
      className="space-y-3 [&_a]:text-brand [&_a]:underline dark:[&_a]:text-sky-300 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: produced by markdown-it with raw HTML switched off
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default async function HomePage() {
  const brand = getBrand();
  const { locale, t } = await getI18n();
  const { data } = await serverApi<{ campaign: PublicCampaign | null }>(`/api/v1/public/campaign?locale=${locale}`);
  const campaign = data?.campaign ?? null;

  if (!campaign) {
    return (
      <section className="py-16 text-center">
        <h1 className="text-3xl font-bold">{t('home.noCampaign.title')}</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">{t('home.noCampaign.text', { appName: brand.appName })}</p>
      </section>
    );
  }

  const open = campaign.status === 'OPEN' && new Date(campaign.orderDeadline) > new Date();

  return (
    <div className="space-y-8 py-6">
      <section className="rounded-2xl bg-brand p-6 text-on-brand sm:p-10">
        <h1 className="text-3xl font-bold sm:text-4xl">{campaign.name}</h1>
        <p className="mt-4 text-lg">{t('home.delivery', { date: formatDate(campaign.deliveryDate, locale) })}</p>
        {campaign.deliveryTimeText && <p className="opacity-90">{t('home.deliveryTime', { time: campaign.deliveryTimeText })}</p>}
        <p className="mt-4 font-semibold">
          {open
            ? t('home.deadline', {
                date: new Date(campaign.orderDeadline).toLocaleString(locale === 'de' ? 'de-CH' : 'en-GB', {
                  dateStyle: 'full',
                  timeStyle: 'short',
                  timeZone: 'Europe/Zurich',
                }),
              })
            : t('home.closed')}
        </p>
        {open && campaign.products.length > 0 && (
          <Link href="/bestellen" className="mt-6 inline-block rounded-full bg-brand-2 px-6 py-3 text-lg font-bold text-on-brand-2 shadow-sm hover:opacity-90">
            {t('home.order')}
          </Link>
        )}
      </section>

      {campaign.infoHtml && (
        <section className="text-lg leading-relaxed">
          <Rendered html={campaign.infoHtml} />
        </section>
      )}

      {campaign.products.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold">{t('home.offer')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {campaign.products.map((product) => (
              <article key={product.id} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
                <h3 className="text-lg font-bold">{product.name}</h3>
                {product.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{product.description}</p>}
                <ul className="mt-3 space-y-1">
                  {product.sizes.map((size) => (
                    <li key={size.id} className="flex justify-between gap-4">
                      <span>{size.label}</span>
                      <span className="font-semibold tabular-nums">{t('common.chf', { amount: formatChf(size.priceRappen, locale) })}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      {campaign.purposeHtml && (
        <section className="space-y-3 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-xl font-bold">{t('home.purpose')}</h2>
          <Rendered html={campaign.purposeHtml} />
        </section>
      )}
    </div>
  );
}
