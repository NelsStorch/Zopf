'use client';

import { useState } from 'react';
import { translator, type Locale, type Planning, type PlanningRoute } from '@zopf/shared';
import { api, type ApiResult } from '@/lib/client';
import { Button } from './ui';

/** Hand a route to its delivery team: link, route sheet, new link, withdraw. */
export function RouteHandover({
  locale,
  route,
  busy,
  run,
}: {
  locale: Locale;
  route: PlanningRoute;
  busy: boolean;
  run: (call: Promise<ApiResult<Planning>>) => Promise<boolean>;
}) {
  const t = translator(locale);
  const [copied, setCopied] = useState(false);

  if (!route.link) {
    return (
      <div className="space-y-1 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
        <p className="text-xs text-zinc-500">{t('route.notReleased')}</p>
        <Button variant="primary" disabled={busy} onClick={() => run(api(`/api/v1/admin/routes/${route.id}/release`, 'POST'))}>
          {t('route.release')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
      <a href={`/api/v1/admin/routes/${route.id}/sheet.pdf`} target="_blank" rel="noopener" className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-on-brand">
        {t('route.sheet')}
      </a>
      <Button
        onClick={async () => {
          await navigator.clipboard.writeText(route.link ?? '');
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? t('route.copied') : t('route.copyLink')}
      </Button>
      <Button disabled={busy} onClick={() => window.confirm(t('route.newLinkConfirm')) && run(api(`/api/v1/admin/routes/${route.id}/release`, 'POST'))}>
        {t('route.newLink')}
      </Button>
      <Button variant="danger" disabled={busy} onClick={() => window.confirm(t('route.withdrawConfirm')) && run(api(`/api/v1/admin/routes/${route.id}/withdraw`, 'POST'))}>
        {t('route.withdraw')}
      </Button>
    </div>
  );
}
