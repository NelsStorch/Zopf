import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { SessionUser } from '@zopf/shared';
import { serverApi } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { LogoutButton } from './LogoutButton';
import { PasswordForm } from './PasswordForm';

export const metadata = { title: 'Admin', robots: { index: false } };

/** Every admin page needs a session; a due password change comes before anything else. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { status, data: user } = await serverApi<SessionUser>('/api/v1/auth/me');
  if (status === 401 || !user) redirect('/admin/login');
  const { locale, t } = await getI18n();

  return (
    <div className="space-y-6 py-4">
      <nav className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <Link href="/admin" className="rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900">
          {t('admin.nav.overview')}
        </Link>
        <Link href="/admin/aktionen" className="rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900">
          {t('admin.nav.campaigns')}
        </Link>
        <span className="ml-auto text-sm text-zinc-500">{user.displayName ?? user.username}</span>
        <LogoutButton label={t('admin.logout')} />
      </nav>

      {user.mustChangePassword ? (
        <div className="max-w-sm space-y-4 rounded-2xl border border-brand-2 p-6">
          <h1 className="text-lg font-bold">{t('admin.password.title')}</h1>
          <p className="text-sm">{t('admin.password.required')}</p>
          <PasswordForm locale={locale} />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
