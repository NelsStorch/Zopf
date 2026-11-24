import 'server-only';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, resolveLocale, translator, type Locale, type Translator } from '@zopf/shared';

/** Language of the current request (picked cookie, then Accept-Language, then German) and its translator. */
export async function getI18n(): Promise<{ locale: Locale; t: Translator }> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get('accept-language'));
  return { locale, t: translator(locale) };
}
