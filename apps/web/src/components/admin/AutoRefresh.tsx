'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Reloads the server data of the page every few seconds (while the tab is visible), and on click. */
export function AutoRefresh({ label, seconds }: { label: string; seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return (
    <button type="button" onClick={() => router.refresh()} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
      ↻ {label}
    </button>
  );
}
