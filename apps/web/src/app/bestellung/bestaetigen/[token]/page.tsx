import { getI18n } from '@/lib/i18n';
import { ConfirmOrder } from './ConfirmOrder';

export const metadata = { robots: { index: false } };

/** The link from the confirmation mail. Confirming needs a click (mail scanners open links on their own). */
export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { locale, t } = await getI18n();
  return (
    <section className="mx-auto max-w-lg space-y-4 py-10 text-center">
      <h1 className="text-3xl font-bold">{t('order.confirm.title')}</h1>
      <ConfirmOrder locale={locale} token={token} />
    </section>
  );
}
