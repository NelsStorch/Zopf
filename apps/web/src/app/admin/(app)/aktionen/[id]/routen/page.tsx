import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Planning } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { PlanningBoard } from '@/components/admin/PlanningBoard';

export default async function RoutesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { data: planning } = await serverApi<Planning>(`/api/v1/admin/campaigns/${id}/planning`);
  if (!planning) notFound();
  const { locale, t } = await getI18n();
  return (
    <section className="space-y-4">
      <Link href={`/admin/aktionen/${planning.campaign.id}`} className="text-sm text-zinc-500 hover:underline">
        ← {planning.campaign.name}
      </Link>
      <h1 className="text-2xl font-bold">
        {t('planning.title')} · {planning.campaign.name}
      </h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('planning.intro')}</p>
      <PlanningBoard locale={locale} initial={planning} />
    </section>
  );
}
