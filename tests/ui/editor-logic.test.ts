import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkExtraProperties,
  planProperties,
  validate,
  type VersionProfile,
  type VersionsFile,
} from '@/core';
import { MESSAGES } from '@/i18n';
import { issueText } from '@/ui/errors';
import { QUESTIONS, answerText, defaultAnswers, sanitizeAnswers, toConfig } from '@/ui/questions';
import { decodeShare, encodeShare } from '@/ui/share';
import { loadDraft, saveDraft } from '@/ui/storage';

const PUBLIC = new URL('../../public/', import.meta.url);
const versions = JSON.parse(readFileSync(new URL('versions.json', PUBLIC), 'utf8')) as VersionsFile;
const profile = (id: string) =>
  JSON.parse(readFileSync(new URL(`profiles/${id}.json`, PUBLIC), 'utf8')) as VersionProfile;
const answers = (over: Record<string, string> = {}) => ({
  ...defaultAnswers(versions.latest.release),
  ...over,
});
const memoryStore = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('the editor question on the sheet', () => {
  it('is the last question of the Advanced step', () => {
    const last = QUESTIONS[QUESTIONS.length - 1]!;
    expect(last).toMatchObject({ id: 'extraProperties', kind: 'editor', step: 'advanced' });
  });

  it('turns saved lines into overrides, and nothing into none', () => {
    expect(toConfig(answers(), true).extraProperties).toEqual({});
    const c = toConfig(
      answers({ extraProperties: 'max-tick-time=120000\nmotd=Hi\\: there\n' }),
      true,
    );
    expect(c.extraProperties).toEqual({ 'max-tick-time': '120000', motd: 'Hi: there' });
    expect(validate(c, versions.versions)).toEqual({ ok: true });
  });

  it('the overrides reach the generated file', () => {
    const c = toConfig(answers({ extraProperties: 'max-tick-time=5' }), true);
    const plan = planProperties(profile('26.3'), c);
    expect(plan.entries.find((e) => e.key === 'max-tick-time')?.value).toBe('5');
    expect(checkExtraProperties(profile('26.3'), c.extraProperties)).toEqual([]);
  });

  it('review says how many settings were changed, in both languages', () => {
    const q = QUESTIONS.find((x) => x.id === 'extraProperties')!;
    expect(answerText(q, '', MESSAGES.en)).toBe('Nothing changed');
    expect(answerText(q, 'a=1', MESSAGES.en)).toBe('1 setting changed');
    expect(answerText(q, 'a=1\nb=2', MESSAGES.en)).toBe('2 settings changed');
    expect(answerText(q, 'a=1\nb=2', MESSAGES['zh-hant'])).toBe('修改了 2 項設定');
  });

  it('saved answers may hold a long edit, but not an enormous one', () => {
    const ok = 'a=1\n'.repeat(1500);
    expect(sanitizeAnswers({ extraProperties: ok }).extraProperties).toBe(ok);
    expect(sanitizeAnswers({ extraProperties: 'x'.repeat(8001) }).extraProperties).toBeUndefined();
  });

  it('every kind of editor problem has a sentence in every language', () => {
    const p = profile('26.3');
    const issues = checkExtraProperties(p, {
      'made-up': '1',
      'allow-flight': 'maybe',
      'max-players': 'x',
      'view-distance': '99',
      difficulty: 'nope',
      'online-mode': 'false',
      'management-server-secret': 'x',
    });
    expect(issues.length).toBe(7);
    for (const locale of ['en', 'zh-hant'] as const) {
      for (const i of issues) {
        const text = issueText(i, MESSAGES[locale]);
        expect(text, `${locale} ${i.code}`).toContain(i.key);
        expect(text).not.toMatch(/\{\w+\}/); // no placeholder left unfilled
      }
    }
  });
});

describe('passwords and secrets never leave the form', () => {
  const withSecret = answers({
    extraProperties: 'max-tick-time=5\nrcon.password=hunter2\nmanagement-server-secret=abc\n',
  });

  it('are left out of the share link, the rest comes through', async () => {
    const token = await encodeShare(withSecret, versions.latest.release);
    const back = await decodeShare(token);
    expect(back?.extraProperties).toContain('max-tick-time=5');
    expect(back?.extraProperties).not.toContain('hunter2');
    expect(back?.extraProperties).not.toContain('secret');
  });

  it('are left out of the autosave', () => {
    const store = memoryStore();
    saveDraft({ answers: withSecret, showSnapshots: false }, store);
    const raw = store.getItem('mcsm.draft.v1') ?? '';
    expect(raw).toContain('max-tick-time');
    expect(raw).not.toContain('hunter2');
    expect(loadDraft(store)?.answers.extraProperties).toBe('max-tick-time=5\n');
  });

  it('a share link with a long edit still round trips', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `bug-report-link=${'x'.repeat(100)}${i}`)
      .map((l, i) => l.replace('bug-report-link', `key${i}`))
      .join('\n');
    const a = answers({ extraProperties: lines });
    const back = await decodeShare(await encodeShare(a, versions.latest.release));
    expect(back?.extraProperties).toBe(`${lines}\n`);
  });
});

describe('remember my settings', () => {
  const store = () => {
    const m = new Map<string, string>();
    return {
      m,
      s: {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
        removeItem: (k: string) => void m.delete(k),
      },
    };
  };

  it('keeps the answers but never a map, a password or a secret', async () => {
    const { saveRemembered, loadRemembered, clearRemembered } = await import('@/ui/storage');
    const { m, s } = store();
    expect(loadRemembered(s)).toBeNull();
    saveRemembered(
      {
        answers: answers({
          motd: 'Hello',
          map: 'My World',
          extraProperties: 'max-tick-time=5\nrcon.password=hunter2\n',
        }),
        showSnapshots: true,
      },
      s,
    );
    const raw = [...m.values()].join('');
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('My World');
    const back = loadRemembered(s);
    expect(back?.answers.motd).toBe('Hello');
    expect(back?.answers.extraProperties).toBe('max-tick-time=5\n');
    expect(back?.answers.map).toBeUndefined();
    expect(back?.showSnapshots).toBe(true);
    clearRemembered(s);
    expect(m.size).toBe(0);
    expect(loadRemembered(s)).toBeNull();
  });

  it('survives broken or hostile saved data', async () => {
    const { loadRemembered } = await import('@/ui/storage');
    const { m, s } = store();
    m.set('mcsm.remember.v1', '{not json');
    expect(loadRemembered(s)).toBeNull();
    m.set(
      'mcsm.remember.v1',
      JSON.stringify({ answers: { motd: 'x'.repeat(500), eulaAccepted: 'true', bogus: 1 } }),
    );
    expect(loadRemembered(s)?.answers).toEqual({});
    expect(loadRemembered(null)).toBeNull();
  });
});
