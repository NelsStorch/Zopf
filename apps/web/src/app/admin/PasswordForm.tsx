'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const input = 'w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700';

export function PasswordForm({ labels, min }: { labels: Record<'current' | 'next' | 'submit' | 'wrong' | 'error', string>; min: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.get('current'), newPassword: form.get('next') }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(res.status === 400 ? labels.wrong : labels.error);
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{labels.current}</span>
        <input name="current" type="password" autoComplete="current-password" required className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{labels.next}</span>
        <input name="next" type="password" autoComplete="new-password" minLength={min} required className={input} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 font-semibold text-on-brand disabled:opacity-60">
        {labels.submit}
      </button>
    </form>
  );
}
