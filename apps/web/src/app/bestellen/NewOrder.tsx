'use client';

import { useState } from 'react';
import { translator, type Locale, type PublicCampaign } from '@zopf/shared';
import { OrderForm } from '@/components/order/OrderForm';
import { api, errorMessage } from '@/lib/client';

export function NewOrder({ locale, campaign }: { locale: Locale; campaign: PublicCampaign }) {
  const t = translator(locale);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <div role="status" className="space-y-3 rounded-2xl bg-brand p-6 text-on-brand sm:p-8">
        <h2 className="text-2xl font-bold">{t('order.sent.title')}</h2>
        <p className="text-lg">{t('order.sent.text', { email: sentTo })}</p>
        <p className="opacity-90">{t('order.sent.spam')}</p>
      </div>
    );
  }

  return (
    <OrderForm
      locale={locale}
      campaign={campaign}
      onSubmit={async (change, extra) => {
        const result = await api('/api/v1/public/orders', 'POST', { ...change, ...extra });
        if (!result.ok) return errorMessage(locale, result);
        setSentTo(extra.email);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return null;
      }}
    />
  );
}
