import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PREFIXED_LOCALES, isLocale } from '@/i18n';
import { RootShell } from '../RootShell';

// Only the languages we have, each built ahead of time (the site is a static export).
export const dynamicParams = false;
export function generateStaticParams() {
  return PREFIXED_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <RootShell locale={locale}>{children}</RootShell>;
}
