import { getI18n } from '@/lib/i18n';
import { Unsubscribe } from './Unsubscribe';

export const metadata = { robots: { index: false }, referrer: 'no-referrer' as const };

/** Unsubscribe link from the reminder mail. Needs a click (mail scanners open links on their own). */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { locale, t } = await getI18n();
  return (
    <section className="mx-auto max-w-lg space-y-4 py-10 text-center">
      <h1 className="text-3xl font-bold">{t('unsubscribe.title')}</h1>
      <Unsubscribe locale={locale} token={token} />
    </section>
  );
}
