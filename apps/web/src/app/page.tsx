import { formatDate, type PublicCampaign } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getBrand } from '@/lib/brand';
import { getI18n } from '@/lib/i18n';

/** Plain text with blank lines as paragraphs. Markdown rendering by the backend follows with the campaign admin. */
function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => (
          <p key={p} className="whitespace-pre-line">
            {p}
          </p>
        ))}
    </>
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
        {open && <p className="mt-6 inline-block rounded-full bg-brand-2 px-5 py-2 font-semibold text-on-brand-2">{t('home.orderSoon')}</p>}
      </section>

      {campaign.info && (
        <section className="space-y-3 text-lg leading-relaxed">
          <Paragraphs text={campaign.info} />
        </section>
      )}

      {campaign.purpose && (
        <section className="space-y-3 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-xl font-bold">{t('home.purpose')}</h2>
          <Paragraphs text={campaign.purpose} />
        </section>
      )}
    </div>
  );
}
