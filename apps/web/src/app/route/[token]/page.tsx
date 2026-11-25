import type { Metadata } from 'next';
import type { DeliveryRoute } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { DeliveryApp } from '@/components/delivery/DeliveryApp';
import { ForgetRoute } from '@/components/delivery/ForgetRoute';

const valid = (token: string) => /^[A-Za-z0-9_-]{20,64}$/.test(token);

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    robots: { index: false },
    referrer: 'no-referrer',
    // Own manifest per link: "add to home screen" opens exactly this route.
    manifest: valid(token) ? `/route/${token}/manifest.webmanifest` : undefined,
  };
}

/** What the route link (QR code on the route sheet) opens: the delivery view for the team's phone. */
export default async function DeliveryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { locale, t } = await getI18n();
  if (!valid(token)) return <p className="py-16 text-center text-lg">{t('delivery.invalid')}</p>;
  const { status, data } = await serverApi<DeliveryRoute>(`/api/v1/public/routes/${token}`);
  // 404: link withdrawn or expired. Other failures (server not reachable): the phone may still have the route.
  if (status === 404) {
    return (
      <>
        <ForgetRoute token={token} />
        <p className="py-16 text-center text-lg">{t('delivery.invalid')}</p>
      </>
    );
  }
  // renderedAt: offline, the service worker serves an older copy of this page; the phone's own copy may be newer.
  return <DeliveryApp locale={locale} token={token} initial={data} renderedAt={new Date().toISOString()} />;
}
