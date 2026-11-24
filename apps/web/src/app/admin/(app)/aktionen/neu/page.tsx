import Link from 'next/link';
import { getI18n } from '@/lib/i18n';
import { NewCampaign } from './NewCampaign';

export default async function NewCampaignPage() {
  const { locale, t } = await getI18n();
  return (
    <section className="space-y-6">
      <Link href="/admin/aktionen" className="text-sm text-zinc-500 hover:underline">
        ← {t('campaigns.back')}
      </Link>
      <h1 className="text-2xl font-bold">{t('campaigns.new')}</h1>
      <NewCampaign locale={locale} />
    </section>
  );
}
