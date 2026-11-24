import { getI18n } from '@/lib/i18n';
import { LostLink } from './LostLink';

export const metadata = { robots: { index: false } };

export default async function LostLinkPage() {
  const { locale, t } = await getI18n();
  return (
    <section className="mx-auto max-w-md space-y-4 py-10">
      <h1 className="text-2xl font-bold">{t('order.lost.title')}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t('order.lost.text')}</p>
      <LostLink locale={locale} />
    </section>
  );
}
