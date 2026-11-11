// The <html> element, shared by the English root layout and the other languages' layout.
// Each language is its own root layout so the server-rendered HTML carries the right lang
// attribute (screen readers and search engines read it before any script runs).
import type { ReactNode } from 'react';
import { LOCALE_INFO, type Locale } from '@/i18n';
import { body, display } from './fonts';
import './globals.css';

export function RootShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html lang={LOCALE_INFO[locale].htmlLang} className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
