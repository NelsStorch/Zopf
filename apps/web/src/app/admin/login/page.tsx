import { redirect } from 'next/navigation';
import type { SessionUser } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { LoginForm } from './LoginForm';

export const metadata = { robots: { index: false } };

export default async function LoginPage() {
  const { status } = await serverApi<SessionUser>('/api/v1/auth/me');
  if (status === 200 || status === 403) redirect('/admin');
  const { t } = await getI18n();
  return (
    <section className="mx-auto max-w-sm py-10">
      <h1 className="mb-6 text-2xl font-bold">{t('admin.login.title')}</h1>
      <LoginForm
        labels={{
          username: t('admin.login.username'),
          password: t('admin.login.password'),
          remember: t('admin.login.remember'),
          submit: t('admin.login.submit'),
          failed: t('admin.login.failed'),
          locked: t('admin.login.locked'),
          error: t('common.error'),
        }}
      />
    </section>
  );
}
