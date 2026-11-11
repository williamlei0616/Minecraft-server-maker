'use client';

// Pieces shared by the builder page and the help page: header (with Help link and language
// switcher), the Chinese-browser notice, and the footer.
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/I18n';
import { LOCALES, LOCALE_INFO, pagePath, type Locale, type Page } from '@/i18n';

/** Where the site is served from (a Pages subpath, or empty). */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const EULA_URL = 'https://aka.ms/MinecraftEULA';

/** The current URL fragment (#gameplay, #java, ...), kept up to date. Empty before the page loads. */
export function useHash(): string {
  const [hash, setHash] = useState('');
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

/** A link to this same page in another language, keeping the step or help topic. */
function hrefFor(locale: Locale, page: Page, hash: string): string {
  // A share-link payload is consumed on arrival; it is never carried to another page.
  const keep = hash.startsWith('#share=') ? '' : hash;
  return `${BASE}${pagePath(locale, page)}${keep}`;
}

export function SiteHeader({ page }: { page: Page }) {
  const { locale, m } = useI18n();
  const hash = useHash();
  const others = LOCALES.filter((l) => l !== locale);
  return (
    <header className="bar">
      <h1>
        <a href={`${BASE}${pagePath(locale, 'home')}`}>{m.site.name}</a>
      </h1>
      {page === 'home' && <p className="reassure">{m.site.reassure}</p>}
      <nav className="topnav" aria-label={m.site.name}>
        {page === 'home' ? (
          <a href={`${BASE}${pagePath(locale, 'help')}`}>{m.site.help}</a>
        ) : (
          <a href={`${BASE}${pagePath(locale, 'home')}`}>{m.help.backToBuilder}</a>
        )}
        {others.map((l) => (
          <a
            key={l}
            href={hrefFor(l, page, hash)}
            lang={LOCALE_INFO[l].htmlLang}
            hrefLang={LOCALE_INFO[l].htmlLang}
          >
            <span className="sr-only">{m.site.language}: </span>
            {LOCALE_INFO[l].name}
          </a>
        ))}
      </nav>
    </header>
  );
}

const NOTICE_KEY = 'mcsm.langnotice.v1';
// Traditional-Chinese browsers only. Simplified (zh-CN, zh-Hans) is not offered yet.
const TRADITIONAL = /^zh-(tw|hk|mo|hant(-[a-z]+)?)$/i;

/** Whether any of the browser's languages is Traditional Chinese (zh-TW, zh-HK, zh-MO, zh-Hant...). */
export function prefersTraditional(languages: readonly string[]): boolean {
  return languages.some((l) => TRADITIONAL.test(l));
}

/**
 * On the English page, a quiet offer to switch to Traditional Chinese for people whose browser is
 * set to it. Never an automatic redirect: those break shared links and surprise people.
 */
export function LangNotice({ page }: { page: Page }) {
  const { locale, m } = useI18n();
  const hash = useHash();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (locale !== 'en') return;
    try {
      if (window.sessionStorage.getItem(NOTICE_KEY)) return;
    } catch {
      /* storage blocked: show it anyway */
    }
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    if (prefersTraditional(langs)) setShow(true);
  }, [locale]);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try {
      window.sessionStorage.setItem(NOTICE_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <p className="langnotice" role="note">
      {m.langNotice.text}{' '}
      <a href={hrefFor('zh-hant', page, hash)} lang="zh-Hant" hrefLang="zh-Hant">
        {m.langNotice.link}
      </a>{' '}
      <button type="button" className="link" onClick={dismiss}>
        {m.langNotice.dismiss}
      </button>
    </p>
  );
}

export function SiteFooter() {
  const { m } = useI18n();
  return (
    <footer className="foot">
      <p>{m.site.footer}</p>
      <p>
        <a href={EULA_URL} target="_blank" rel="noopener noreferrer">
          {m.site.eulaLink}
        </a>
      </p>
    </footer>
  );
}
