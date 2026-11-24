'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
      onClick={async () => {
        await fetch('/api/v1/auth/logout', { method: 'POST' });
        router.replace('/admin/login');
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
