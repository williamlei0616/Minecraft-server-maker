// Languages and where their pages live.
// English is the default and lives at the site root; every other language has a path prefix:
//   /  /help/        English
//   /zh-hant/  /zh-hant/help/   Traditional Chinese
export const LOCALES = ['en', 'zh-hant'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Languages that get a path prefix (everything except the default). */
export const PREFIXED_LOCALES: readonly Locale[] = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

export const LOCALE_INFO: Record<Locale, { name: string; htmlLang: string }> = {
  en: { name: 'English', htmlLang: 'en' },
  'zh-hant': { name: '繁體中文', htmlLang: 'zh-Hant' },
};

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);

export type Page = 'home' | 'help';

/** "" for English, "/zh-hant" for Traditional Chinese. */
export const pathPrefix = (locale: Locale): string =>
  locale === DEFAULT_LOCALE ? '' : `/${locale}`;

/** Path of a page in a language, with a trailing slash (the site exports with trailingSlash). */
export const pagePath = (locale: Locale, page: Page): string =>
  `${pathPrefix(locale)}${page === 'help' ? '/help' : ''}/`;
