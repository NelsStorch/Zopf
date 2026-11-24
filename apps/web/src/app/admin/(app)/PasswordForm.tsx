'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { PASSWORD_MIN, translator, type Locale } from '@zopf/shared';
import { Button, Field, inputClass, Notice } from '@/components/admin/ui';
import { api } from '@/lib/client';

export function PasswordForm({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await api('/api/v1/auth/change-password', 'POST', { currentPassword: form.get('current'), newPassword: form.get('next') });
    setBusy(false);
    if (result.ok) router.refresh();
    else setError(result.error === 'wrong_password' ? t('admin.password.wrong') : t('common.error'));
  }

  return (
    <form method="post" onSubmit={submit} className="space-y-4">
      <Field label={t('admin.password.current')}>
        <input name="current" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <Field label={t('admin.password.new', { min: PASSWORD_MIN })}>
        <input name="next" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required className={inputClass} />
      </Field>
      {error && <Notice kind="error">{error}</Notice>}
      <Button type="submit" variant="primary" disabled={busy}>
        {t('admin.password.submit')}
      </Button>
    </form>
  );
}
