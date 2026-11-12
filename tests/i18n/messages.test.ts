import { describe, expect, it } from 'vitest';
import { fmt, parseTags, placeholdersOf, tagsOf } from '@/i18n/format';
import { LOCALES, MESSAGES, pagePath, pathPrefix, type Locale } from '@/i18n';
import { QUESTIONS } from '@/ui/questions';
import { STEPS } from '@/ui/steps';

const ENGLISH = MESSAGES.en;
const OTHERS = LOCALES.filter((l): l is Exclude<Locale, 'en'> => l !== 'en');

/** Visit every string in two trees that must have the same shape. */
function walk(
  a: unknown,
  b: unknown,
  path: string,
  visit: (path: string, a: string, b: string) => void,
): void {
  if (typeof a === 'string') {
    expect(typeof b, `${path} must be a string`).toBe('string');
    visit(path, a, b as string);
    return;
  }
  if (Array.isArray(a)) {
    expect(Array.isArray(b), `${path} must be a list`).toBe(true);
    expect((b as unknown[]).length, `${path} must have as many entries as English`).toBe(a.length);
    a.forEach((item, i) => walk(item, (b as unknown[])[i], `${path}[${i}]`, visit));
    return;
  }
  expect(typeof b, `${path} must be an object`).toBe('object');
  const bObj = b as Record<string, unknown>;
  const aObj = a as Record<string, unknown>;
  expect(Object.keys(bObj).sort(), `${path} must have the same keys as English`).toEqual(
    Object.keys(aObj).sort(),
  );
  for (const key of Object.keys(aObj)) walk(aObj[key], bObj[key], `${path}.${key}`, visit);
}

describe('every language has the same shape as English', () => {
  for (const locale of OTHERS) {
    it(`${locale}: same keys, same placeholders, same tags in every string`, () => {
      let count = 0;
      walk(ENGLISH, MESSAGES[locale], locale, (path, en, other) => {
        count++;
        expect(other.trim(), `${path} must not be empty`).not.toBe('');
        expect(placeholdersOf(other), `${path}: {placeholders} must match English`).toEqual(
          placeholdersOf(en),
        );
        expect(tagsOf(other), `${path}: <tags> must match English`).toEqual(tagsOf(en));
      });
      expect(count).toBeGreaterThan(150);
    });
  }

  it('no string has a stray < or > outside its tags, or an unbalanced tag', () => {
    for (const locale of LOCALES) {
      walk(ENGLISH, MESSAGES[locale], locale, (path, _en, text) => {
        const plain = parseTags(text)
          .map((p) => p.text)
          .join('');
        expect(plain, `${locale} ${path}`).not.toMatch(/[<>]/);
      });
    }
  });
});

describe('the text covers everything the page can show', () => {
  it('has text for every question, and labels for every answer a choice question offers', () => {
    for (const locale of LOCALES) {
      const m = MESSAGES[locale];
      for (const q of QUESTIONS) {
        const text = m.questions[q.id];
        expect(text.title, `${locale} ${q.id}`).toBeTruthy();
        expect(text.help, `${locale} ${q.id}`).toBeTruthy();
        expect(m.labels[q.id], `${locale} ${q.id} label`).toBeTruthy();
        if (q.kind === 'choice') {
          expect(Object.keys(text.options ?? {}).sort(), `${locale} ${q.id} options`).toEqual(
            [...q.opts].sort(),
          );
        }
        // Every number question except the port shows a unit.
        if (q.kind === 'number' && q.id !== 'port')
          expect(text.unit, `${locale} ${q.id} unit`).toBeTruthy();
      }
    }
  });

  it('has a title and intro for every step', () => {
    for (const locale of LOCALES) {
      for (const s of STEPS) {
        expect(MESSAGES[locale].steps[s.id].title).toBeTruthy();
        expect(MESSAGES[locale].steps[s.id].intro).toBeTruthy();
      }
    }
  });

  it('has the same help topics, in the same order, in every language', () => {
    const ids = ENGLISH.help.topics.map((t) => t.id);
    expect(ids).toEqual([
      'java',
      'closes',
      'warning',
      'download',
      'friends',
      'port',
      'version',
      'world',
      'slow',
      'rules',
      'players',
      'map',
      'editor',
      'eula',
    ]);
    for (const locale of OTHERS) {
      expect(MESSAGES[locale].help.topics.map((t) => t.id)).toEqual(ids);
    }
  });

  it('the Java topic has install steps in every language', () => {
    for (const locale of LOCALES) {
      const java = MESSAGES[locale].help.topics.find((t) => t.id === 'java')!;
      expect(java.steps?.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('Traditional Chinese really is Chinese', () => {
  it('uses Chinese characters in the visible text (commands, versions and links stay as they are)', () => {
    const cjk = /[一-鿿]/;
    let checked = 0;
    walk(ENGLISH, MESSAGES['zh-hant'], 'zh-hant', (path, _en, text) => {
      // English on purpose: the offer to switch back to English, and the document's actual name.
      if (
        ['zh-hant.langNotice.text', 'zh-hant.langNotice.link', 'zh-hant.site.eulaLink'].includes(
          path,
        )
      )
        return;
      checked++;
      const withoutTags = parseTags(text)
        .map((p) => p.text)
        .join('');
      // A line that is only a unit-less fragment (for example "GB") is allowed to have none.
      if (withoutTags.length > 12) expect(withoutTags, path).toMatch(cjk);
    });
    expect(checked).toBeGreaterThan(150);
  });

  it('does not use Simplified-only characters in a few common words', () => {
    const all = JSON.stringify(MESSAGES['zh-hant']);
    for (const simplified of ['设置', '伺服务', '内存', '选择', '确认', '开启服务器', '这个']) {
      expect(all, simplified).not.toContain(simplified);
    }
  });
});

describe('text helpers', () => {
  it('fmt fills placeholders and leaves unknown ones visible', () => {
    expect(fmt('Step {n} of {total}', { n: 2, total: 4 })).toBe('Step 2 of 4');
    expect(fmt('Hello {who}', {})).toBe('Hello {who}');
    expect(fmt('{a}{a}', { a: 'x' })).toBe('xx');
  });

  it('fmt treats values as plain text, never as more placeholders or tags', () => {
    expect(fmt('Name: {name}', { name: '{n}<b>x</b>' })).toBe('Name: {n}<b>x</b>');
  });

  it('parseTags splits text and tags in order', () => {
    expect(parseTags('Open <adoptium>this page</adoptium>, then <b>run</b> it.')).toEqual([
      { kind: 'text', text: 'Open ' },
      { kind: 'tag', name: 'adoptium', text: 'this page' },
      { kind: 'text', text: ', then ' },
      { kind: 'tag', name: 'b', text: 'run' },
      { kind: 'text', text: ' it.' },
    ]);
    expect(parseTags('plain')).toEqual([{ kind: 'text', text: 'plain' }]);
    expect(parseTags('')).toEqual([]);
  });

  it('placeholdersOf and tagsOf list what a string uses', () => {
    expect(placeholdersOf('{b} and {a} and {a}')).toEqual(['a', 'b']);
    expect(tagsOf('<code>x</code> <b>y</b> <code>z</code>')).toEqual(['b', 'code']);
  });
});

describe('where each language lives', () => {
  it('English is at the root, others under their own prefix', () => {
    expect(pathPrefix('en')).toBe('');
    expect(pathPrefix('zh-hant')).toBe('/zh-hant');
    expect(pagePath('en', 'home')).toBe('/');
    expect(pagePath('en', 'help')).toBe('/help/');
    expect(pagePath('zh-hant', 'home')).toBe('/zh-hant/');
    expect(pagePath('zh-hant', 'help')).toBe('/zh-hant/help/');
  });
});
