import Link from 'next/link';
import type { PublicCampaign } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { NewOrder } from './NewOrder';

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t('order.title') };
}

export default async function OrderPage() {
  const { locale, t } = await getI18n();
  const { data } = await serverApi<{ campaign: PublicCampaign | null }>(`/api/v1/public/campaign?locale=${locale}`);
  const campaign = data?.campaign;
  const open = campaign && campaign.status === 'OPEN' && new Date(campaign.orderDeadline) > new Date() && campaign.products.length > 0;

  return (
    <section className="space-y-6 py-6">
      <h1 className="text-3xl font-bold">{t('order.title')}</h1>
      {open ? (
        <NewOrder locale={locale} campaign={campaign} />
      ) : (
        <p className="text-zinc-600 dark:text-zinc-400">
          {t('order.closed')}{' '}
          <Link href="/" className="underline">
            ←
          </Link>
        </p>
      )}
    </section>
  );
}
