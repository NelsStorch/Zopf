import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { AdminCampaign } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { CampaignEditor } from './CampaignEditor';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { data } = await serverApi<AdminCampaign>(`/api/v1/admin/campaigns/${id}`);
  if (!data) notFound();
  const { locale, t } = await getI18n();
  return (
    <section className="space-y-6">
      <Link href="/admin/aktionen" className="text-sm text-zinc-500 hover:underline">
        ← {t('campaigns.back')}
      </Link>
      <CampaignEditor locale={locale} initial={data} />
    </section>
  );
}
