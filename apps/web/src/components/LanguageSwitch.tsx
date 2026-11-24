'use client';

import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, type Locale } from '@zopf/shared';

/** Switches between German and English; the choice is kept in a cookie for a year. */
export function LanguageSwitch({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const next: Locale = locale === 'de' ? 'en' : 'de';
  return (
    <button
      type="button"
      className="rounded-full border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      lang={next}
      onClick={() => {
        // biome-ignore lint/suspicious/noDocumentCookie: a plain preference cookie, no Cookie Store API needed
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
