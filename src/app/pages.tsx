// What each route renders, per language. The route files are thin wrappers around these.
import type { Metadata } from 'next';
import { I18nProvider } from '@/i18n/I18n';
import { getMessages, type Locale, type Page } from '@/i18n';
import { Builder } from '@/ui/Builder';
import { Help } from '@/ui/Help';

export function metaFor(locale: Locale, page: Page): Metadata {
  const meta = getMessages(locale).meta;
  return page === 'help'
    ? { title: meta.helpTitle, description: meta.helpDescription }
    : { title: meta.title, description: meta.description };
}

export function HomePage({ locale }: { locale: Locale }) {
  return (
    <I18nProvider locale={locale}>
      <Builder />
    </I18nProvider>
  );
}

export function HelpPage({ locale }: { locale: Locale }) {
  return (
    <I18nProvider locale={locale}>
      <Help />
    </I18nProvider>
  );
}
