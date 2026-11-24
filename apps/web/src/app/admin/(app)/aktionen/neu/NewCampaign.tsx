'use client';

import { useRouter } from 'next/navigation';
import type { Locale } from '@zopf/shared';
import { CampaignForm } from '@/components/admin/CampaignForm';

export function NewCampaign({ locale }: { locale: Locale }) {
  const router = useRouter();
  return <CampaignForm locale={locale} campaign={null} onSaved={(created) => router.push(`/admin/aktionen/${created.id}`)} />;
}
