import { de, type MessageKey } from './de.js';
import { en } from './en.js';

export type { MessageKey };

export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'de';

/** Cookie that keeps the language a visitor picked. */
export const LOCALE_COOKIE = 'zopf_locale';

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { de, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The language for a request: the picked one (cookie) first, then the first
 * supported language in Accept-Language, then German.
 */
export function resolveLocale(cookie: string | undefined | null, acceptLanguage: string | undefined | null): Locale {
  if (isLocale(cookie)) return cookie;
  const wanted = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { lang: tag.toLowerCase().split('-')[0], q: q === undefined ? 1 : Number(q) };
    })
    .filter((x) => x.lang && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  for (const { lang } of wanted) if (isLocale(lang)) return lang;
  return DEFAULT_LOCALE;
}

export type Translator = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** t('home.deadline', { date: '…' }): replaces {name} placeholders; unknown ones stay visible. */
export function translator(locale: Locale): Translator {
  const messages = MESSAGES[locale];
  return (key, vars) => {
    const text = messages[key] ?? de[key] ?? key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
  };
}

/** Date in the visitor's language, always in Swiss time. */
export function formatDate(value: Date | string, locale: Locale, withWeekday = true): string {
  return new Date(value).toLocaleDateString(locale === 'de' ? 'de-CH' : 'en-GB', {
    weekday: withWeekday ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Zurich',
  });
}
