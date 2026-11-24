import { redirect } from 'next/navigation';
import { PASSWORD_MIN, type SessionUser } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { LogoutButton } from './LogoutButton';
import { PasswordForm } from './PasswordForm';

export const metadata = { title: 'Admin', robots: { index: false } };

export default async function AdminPage() {
  const { status, data } = await serverApi<SessionUser>('/api/v1/auth/me');
  if (status === 401 || !data) redirect('/admin/login');
  const { t } = await getI18n();

  return (
    <section className="space-y-8 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <LogoutButton label={t('admin.logout')} />
      </div>
      <p>{t('admin.welcome', { name: data.displayName ?? data.username })}</p>

      {data.mustChangePassword ? (
        <div className="max-w-sm space-y-4 rounded-2xl border border-brand-2 p-6">
          <h2 className="text-lg font-bold">{t('admin.password.title')}</h2>
          <p className="text-sm">{t('admin.password.required')}</p>
          <PasswordForm
            labels={{
              current: t('admin.password.current'),
              next: t('admin.password.new', { min: PASSWORD_MIN }),
              submit: t('admin.password.submit'),
              wrong: t('admin.password.wrong'),
              error: t('common.error'),
            }}
            min={PASSWORD_MIN}
          />
        </div>
      ) : (
        <p className="text-zinc-600 dark:text-zinc-400">{t('admin.dashboard.empty')}</p>
      )}
    </section>
  );
}
