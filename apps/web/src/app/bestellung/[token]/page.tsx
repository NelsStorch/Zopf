import { notFound } from 'next/navigation';
import type { PublicCampaign, PublicOrder } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { OrderView } from './OrderView';

export const metadata = { robots: { index: false } };

/** Personal order page (link from the mail). */
export default async function OrderPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ neu?: string }> }) {
  const [{ token }, { neu }] = await Promise.all([params, searchParams]);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const { locale } = await getI18n();
  const [{ data: order }, { data: campaignData }] = await Promise.all([
    serverApi<PublicOrder>(`/api/v1/public/orders/${token}`),
    serverApi<{ campaign: PublicCampaign | null }>(`/api/v1/public/campaign?locale=${locale}`),
  ]);
  if (!order) notFound();
  return <OrderView locale={locale} token={token} initial={order} campaign={campaignData?.campaign ?? null} justConfirmed={neu === '1'} />;
}
