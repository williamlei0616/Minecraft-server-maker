import { en } from './en';
import { DEFAULT_LOCALE, type Locale } from './locales';
import type { Messages } from './messages';
import { zhHant } from './zh-hant';

export const MESSAGES: Record<Locale, Messages> = { en, 'zh-hant': zhHant };

export const getMessages = (locale: Locale): Messages =>
  MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];

export * from './locales';
export type { Messages } from './messages';
