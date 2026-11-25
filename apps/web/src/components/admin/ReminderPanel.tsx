'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { translator, type Locale, type ReminderStatus } from '@zopf/shared';
import { api, errorMessage } from '@/lib/client';
import { Button, Field, inputClass, Notice } from './ui';

/** The one reminder to everyone who asked for it with an earlier order: preview, test, send. */
export function ReminderPanel({ locale, campaignId, open, postalAddress }: { locale: Locale; campaignId: number; open: boolean; postalAddress: boolean }) {
  const t = translator(locale);
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    const result = await api<ReminderStatus>(`/api/v1/admin/campaigns/${campaignId}/reminders`);
    if (result.data) setStatus(result.data);
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!status?.running) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [status?.running, load]);

  async function test(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await api(`/api/v1/admin/campaigns/${campaignId}/reminders/test`, 'POST', { email: new FormData(event.currentTarget).get('email'), locale });
    setBusy(false);
    setNotice(result.ok ? { kind: 'ok', text: t('reminder.testSent') } : { kind: 'error', text: errorMessage(locale, result) });
  }

  async function send() {
    if (!status || !window.confirm(t('reminder.sendConfirm', { count: status.pending }))) return;
    setBusy(true);
    const result = await api<ReminderStatus>(`/api/v1/admin/campaigns/${campaignId}/reminders/send`, 'POST');
    setBusy(false);
    if (result.ok && result.data) setStatus(result.data);
    else setNotice({ kind: 'error', text: errorMessage(locale, result) });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-xl font-bold">{t('reminder.title')}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('reminder.adminIntro')}</p>
      {status && <p className="font-medium">{t('reminder.stats', { contacts: status.contacts, reminded: status.reminded, pending: status.pending })}</p>}

      {!open ? (
        <p className="text-sm text-zinc-500">{t('reminder.notOpen')}</p>
      ) : !postalAddress ? (
        <Notice kind="error">{t('reminder.noPostal')}</Notice>
      ) : (
        <>
          <Button onClick={() => setPreview(!preview)} aria-expanded={preview}>
            {t('reminder.preview')}
          </Button>
          {preview && (
            <iframe
              title={t('reminder.preview')}
              src={`/api/v1/admin/campaigns/${campaignId}/reminders/preview`}
              sandbox=""
              className="h-[520px] w-full rounded-xl border border-zinc-200 bg-white dark:border-zinc-800"
            />
          )}
          <form method="post" onSubmit={test} className="flex flex-wrap items-end gap-2">
            <Field label={t('reminder.testTo')}>
              <input name="email" type="email" required className={`${inputClass} min-w-64`} />
            </Field>
            <Button type="submit" disabled={busy}>
              {t('reminder.sendTest')}
            </Button>
          </form>
          {status?.running ? (
            <p role="status" className="flex items-center gap-2 text-sm">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              {t('reminder.running', { sent: status.sent, failed: status.failed })}
            </p>
          ) : status && status.pending > 0 ? (
            <Button variant="primary" disabled={busy} onClick={send}>
              {t('reminder.send', { count: status.pending })}
            </Button>
          ) : (
            status && <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('reminder.nothing')}</p>
          )}
          {status && !status.running && status.sent + status.failed > 0 && (
            <Notice kind="ok">{t('reminder.done', { sent: status.sent, failed: status.failed })}</Notice>
          )}
        </>
      )}
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    </section>
  );
}
