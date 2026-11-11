import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ValidationDetail, VersionsFile } from '@/core';
import { LOCALES, MESSAGES } from '@/i18n';
import { errorText } from '@/ui/errors';
import { javaRanges } from '@/ui/javaTable';
import { prefersTraditional } from '@/ui/shell';

const versions = JSON.parse(
  readFileSync(new URL('../../public/versions.json', import.meta.url), 'utf8'),
) as VersionsFile;

describe('the Java table on the help page', () => {
  it('groups releases by the Java they need, newest Java first', () => {
    const rows = javaRanges(versions.versions);
    expect(rows.map((r) => r.java)).toEqual([25, 21, 17]);
    expect(rows.find((r) => r.java === 17)).toMatchObject({ from: '1.18.2', to: '1.20.4' });
    expect(rows.find((r) => r.java === 21)).toMatchObject({ from: '1.20.5', to: '1.21.11' });
    expect(rows.find((r) => r.java === 25)?.from).toBe('26.1');
  });

  it('every release is covered exactly once, and test versions are left out', () => {
    const rows = javaRanges(versions.versions);
    const releases = versions.versions.filter((v) => v.type === 'release');
    for (const v of releases) {
      const hit = rows.filter((r) => r.java === v.javaMajor);
      expect(hit, v.id).toHaveLength(1);
    }
    expect(rows.flatMap((r) => [r.from, r.to]).some((id) => id.includes('snapshot'))).toBe(false);
  });

  it('copes with one version and with no versions', () => {
    const one = versions.versions.filter((v) => v.id === '26.3');
    expect(javaRanges(one)).toEqual([{ java: 25, from: '26.3', to: '26.3' }]);
    expect(javaRanges([])).toEqual([]);
  });
});

describe('error messages in the page language', () => {
  const cases: [ValidationDetail, string, string][] = [
    [
      { code: 'range', min: 1024, max: 65535 },
      'Type a whole number from 1024 to 65535.',
      '請輸入 1024 到 65535 之間的整數。',
    ],
    [{ code: 'tooLong', max: 200 }, 'Keep this under 200 characters.', '請不要超過 200 個字元。'],
    [
      { code: 'username' },
      'Use 3 to 16 letters, numbers or underscores. No spaces.',
      '請使用 3 到 16 個英文字母、數字或底線，不能有空格。',
    ],
  ];

  it('fills in the numbers and speaks the language', () => {
    for (const [detail, en, zh] of cases) {
      expect(errorText(detail, 'fallback', MESSAGES.en)).toBe(en);
      expect(errorText(detail, 'fallback', MESSAGES['zh-hant'])).toBe(zh);
    }
  });

  it('has a sentence for every kind of mistake core can report, in every language', () => {
    for (const locale of LOCALES) {
      for (const code of [
        'version',
        'choice',
        'onoff',
        'range',
        'blank',
        'tooLong',
        'username',
      ] as const) {
        const text = errorText({ code, min: 1, max: 9 }, 'fallback', MESSAGES[locale]);
        expect(text, `${locale} ${code}`).not.toBe('fallback');
        expect(text, `${locale} ${code}`).not.toMatch(/[{}]/);
      }
    }
  });

  it('falls back to core’s own sentence when there are no details', () => {
    expect(errorText(undefined, 'Type a number.', MESSAGES.en)).toBe('Type a number.');
  });
});

describe('help topics the scripts and the README link to', () => {
  it('java and download exist in every language (the start scripts print #java and #download)', () => {
    for (const locale of LOCALES) {
      const ids = MESSAGES[locale].help.topics.map((t) => t.id);
      expect(ids, locale).toContain('java');
      expect(ids, locale).toContain('download');
    }
  });
});

describe('who is offered Traditional Chinese', () => {
  it('Traditional Chinese browsers are, Simplified and others are not', () => {
    for (const l of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'ZH-tw']) {
      expect(prefersTraditional([l]), l).toBe(true);
    }
    for (const l of ['en-US', 'zh-CN', 'zh-Hans', 'zh-Hans-CN', 'zh', 'ja', 'fr', '']) {
      expect(prefersTraditional([l]), l).toBe(false);
    }
  });

  it('any one language in the list is enough', () => {
    expect(prefersTraditional(['en-US', 'zh-TW'])).toBe(true);
    expect(prefersTraditional([])).toBe(false);
  });
});
