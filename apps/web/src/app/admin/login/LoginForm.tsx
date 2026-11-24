'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const input = 'w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700';

export function LoginForm({ labels }: { labels: Record<'username' | 'password' | 'remember' | 'submit' | 'failed' | 'locked' | 'error', string> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password'), remember: form.get('remember') === 'on' }),
      });
      if (res.ok) {
        router.replace('/admin');
        router.refresh();
        return;
      }
      setError(res.status === 429 ? labels.locked : res.status === 401 ? labels.failed : labels.error);
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{labels.username}</span>
        <input name="username" autoComplete="username" required className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{labels.password}</span>
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="remember" type="checkbox" />
        {labels.remember}
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-on-brand disabled:opacity-60">
        {labels.submit}
      </button>
    </form>
  );
}
