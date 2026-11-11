'use client';

// The language of the page, available to every component: useI18n() gives the messages,
// plain text with placeholders (t) and text with <tags> turned into elements (rich).
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { fmt, parseTags, type Params } from './format';
import { getMessages } from './index';
import type { Locale } from './locales';
import type { Messages } from './messages';

/** Renders what is inside a tag; tags with no entry are shown as plain text. */
export type TagRenderers = Record<string, (children: string) => ReactNode>;

interface I18n {
  locale: Locale;
  m: Messages;
  /** Fill {placeholders} in a message. */
  t: (template: string, params?: Params) => string;
  /** Fill placeholders, then turn <b>, <code> and any tag in `tags` into elements. */
  rich: (template: string, params?: Params, tags?: TagRenderers) => ReactNode[];
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18n>(() => {
    const m = getMessages(locale);
    return {
      locale,
      m,
      t: (template, params) => fmt(template, params),
      rich: (template, params, tags = {}) =>
        parseTags(fmt(template, params)).map((piece, i) => {
          if (piece.kind === 'text') return piece.text;
          if (piece.name === 'b') return <strong key={i}>{piece.text}</strong>;
          if (piece.name === 'code') return <code key={i}>{piece.text}</code>;
          const render = tags[piece.name];
          return render ? <span key={i}>{render(piece.text)}</span> : piece.text;
        }),
    };
  }, [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
  return v;
}
