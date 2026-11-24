import type { Metadata, Viewport } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { brandStyle, getBrand } from '@/lib/brand';
import { getI18n } from '@/lib/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const brand = getBrand();
  return {
    title: { default: `${brand.appName} · ${brand.orgName}`, template: `%s · ${brand.appName}` },
    icons: { icon: '/brand/favicon' },
  };
}

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: getBrand().primary };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = getBrand();
  const { locale, t } = await getI18n();

  return (
    <html lang={locale} style={brandStyle(brand) as CSSProperties}>
      <body className="flex min-h-dvh flex-col">
        <div className="h-1.5 bg-gradient-to-r from-brand from-60% to-brand-2 to-60%" />
        <header className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <img src="/brand/logo" alt="" className="h-10 w-10 object-contain" />
            <span className="leading-tight">
              <span className="block text-lg font-bold">{brand.appName}</span>
              <span className="block text-sm text-zinc-500">{brand.orgName}</span>
            </span>
          </Link>
          <LanguageSwitch locale={locale} label={t('lang.switch')} />
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-12">{children}</main>

        <footer className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-4xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-zinc-500">
            <span>
              {brand.appName} · {brand.orgName}
            </span>
            {brand.contactEmail && (
              <a className="hover:underline" href={`mailto:${brand.contactEmail}`}>
                {t('footer.contact')}
              </a>
            )}
            {brand.imprintUrl && (
              <a className="hover:underline" href={brand.imprintUrl} rel="noopener">
                {t('footer.imprint')}
              </a>
            )}
            <Link className="hover:underline" href="/datenschutz">
              {t('footer.privacy')}
            </Link>
            <Link className="hover:underline" href="/bestellung">
              {t('order.lost.link')}
            </Link>
            <Link className="ml-auto hover:underline" href="/admin">
              {t('footer.admin')}
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
