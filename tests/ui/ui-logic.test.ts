import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultConfig, validate, type VersionProfile, type VersionsFile } from '@/core';
import { MESSAGES } from '@/i18n';
import { unavailableNote, unavailableQuestions } from '@/ui/availability';
import {
  QUESTIONS,
  TOTAL,
  answerText,
  defaultAnswers,
  parseList,
  sanitizeAnswers,
  toConfig,
} from '@/ui/questions';

const PUBLIC = new URL('../../public/', import.meta.url);
const versions = JSON.parse(readFileSync(new URL('versions.json', PUBLIC), 'utf8')) as VersionsFile;
const profile = (id: string) =>
  JSON.parse(readFileSync(new URL(`profiles/${id}.json`, PUBLIC), 'utf8')) as VersionProfile;

describe('which questions a version cannot take', () => {
  it('none before 1.21.9: 1.18.2 and 1.21.4 can set everything', () => {
    expect(unavailableQuestions(profile('1.18.2'))).toEqual({});
    expect(unavailableQuestions(profile('1.21.4'))).toEqual({});
  });

  it('PvP and command blocks are unavailable from 1.21.9 on, with a plain explanation', () => {
    for (const id of ['1.21.9', '1.21.11', '26.1', '26.3']) {
      const u = unavailableQuestions(profile(id));
      expect(Object.keys(u).sort(), id).toEqual(['commandBlocks', 'pvp']);
      expect(u.pvp?.reason).toBe('game-rule');
      expect(unavailableNote(u.pvp!, MESSAGES.en)).toMatch(/cannot set it/);
      expect(unavailableNote(u.pvp!, MESSAGES['zh-hant'])).toContain('/gamerule');
    }
  });

  it('knows nothing until a profile has loaded', () => {
    expect(unavailableQuestions(null)).toEqual({});
  });

  it('the boundary is exactly 1.21.8 / 1.21.9 across every listed release', () => {
    const releases = versions.versions.filter((v) => v.type === 'release').map((v) => v.id);
    const lacking = releases.filter((id) => 'pvp' in unavailableQuestions(profile(id)));
    expect(lacking).toEqual(
      expect.arrayContaining([
        '1.21.9',
        '1.21.10',
        '1.21.11',
        '26.1',
        '26.1.1',
        '26.1.2',
        '26.2',
        '26.3',
      ]),
    );
    expect(lacking).not.toContain('1.21.8');
    expect(lacking).toHaveLength(8);
  });
});

describe('the sheet and core agree', () => {
  it('has one question per core option (plus the version), and every answer id is real', () => {
    const cfg = Object.keys(defaultConfig(versions));
    for (const q of QUESTIONS) expect(cfg, q.id).toContain(q.id);
    expect(TOTAL).toBe(QUESTIONS.length);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
  });

  it("the sheet defaults produce exactly core's defaults", () => {
    const fromSheet = toConfig(defaultAnswers(versions.latest.release), false);
    expect(fromSheet).toEqual(defaultConfig(versions));
  });

  it('the defaults are valid out of the box', () => {
    expect(
      validate(toConfig(defaultAnswers(versions.latest.release), false), versions.versions),
    ).toEqual({ ok: true });
  });

  it('Hardcore always means Hard', () => {
    const a = {
      ...defaultAnswers(versions.latest.release),
      hardcore: 'yes',
      difficulty: 'peaceful',
    };
    const c = toConfig(a, true);
    expect(c.hardcore).toBe(true);
    expect(c.difficulty).toBe('hard');
  });

  it('empty or text in a number box becomes NaN so core reports it, never a silent 0', () => {
    const a = { ...defaultAnswers(versions.latest.release), port: '', maxPlayers: 'abc' };
    const c = toConfig(a, false);
    expect(Number.isNaN(c.port)).toBe(true);
    const r = validate(c, versions.versions);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['maxPlayers', 'port']);
  });

  it('choice options in the sheet are exactly values core accepts', () => {
    for (const q of QUESTIONS) {
      if (q.kind !== 'choice') continue;
      for (const value of q.opts) {
        // an owner name, so that "only people on my list" is not an empty (locked-out) list
        const a = {
          ...defaultAnswers(versions.latest.release),
          opUsername: 'Notch',
          [q.id]: value,
        };
        expect(validate(toConfig(a, true), versions.versions), `${q.id}=${value}`).toEqual({
          ok: true,
        });
      }
    }
  });
});

describe('player lists on the sheet', () => {
  const answers = (over: Record<string, string> = {}) => ({
    ...defaultAnswers(versions.latest.release),
    ...over,
  });

  it('parseList splits on lines, commas, semicolons and spaces and drops blanks', () => {
    expect(parseList('')).toEqual([]);
    expect(parseList('  \n ')).toEqual([]);
    expect(parseList('Alex\nSteve_01, Notch;  jeb_\r\n\n')).toEqual([
      'Alex',
      'Steve_01',
      'Notch',
      'jeb_',
    ]);
  });

  it('defaults to anyone with empty lists, which is valid', () => {
    const c = toConfig(answers(), true);
    expect(c).toMatchObject({
      whitelist: false,
      allowedPlayers: [],
      blockedPlayers: [],
      blockedIps: [],
    });
    expect(validate(c, versions.versions)).toEqual({ ok: true });
  });

  it('only people on my list: reads the allow list, the block list and the addresses', () => {
    const c = toConfig(
      answers({
        whitelist: 'list',
        allowedPlayers: 'Alex\nSteve_01',
        blockedPlayers: 'Griefer99',
        blockedIps: '203.0.113.7\n2001:db8::1',
      }),
      true,
    );
    expect(c).toMatchObject({
      whitelist: true,
      allowedPlayers: ['Alex', 'Steve_01'],
      blockedPlayers: ['Griefer99'],
      blockedIps: ['203.0.113.7', '2001:db8::1'],
    });
    expect(validate(c, versions.versions)).toEqual({ ok: true });
  });

  it('with "anyone", typed allow-list names stay in the box but are not used', () => {
    const c = toConfig(answers({ whitelist: 'anyone', allowedPlayers: 'Alex' }), true);
    expect(c.allowedPlayers).toEqual([]);
    expect(c.whitelist).toBe(false);
  });

  it('shows core problems for the right question', () => {
    const r = validate(
      toConfig(answers({ whitelist: 'list', allowedPlayers: 'a b c\nbad-name' }), true),
      versions.versions,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details.allowedPlayers?.code).toBe('listName');
    const locked = validate(toConfig(answers({ whitelist: 'list' }), true), versions.versions);
    expect(locked.ok === false && locked.details.allowedPlayers?.code).toBe('whitelistEmpty');
  });

  it('a share link or saved answers may hold long lists but nothing else long', () => {
    const long = 'x'.repeat(2500);
    const out = sanitizeAnswers({ allowedPlayers: long, motd: 'm'.repeat(300), bogus: 'x' });
    expect(out.allowedPlayers).toBe(long);
    expect(out.motd).toBeUndefined();
    expect('bogus' in out).toBe(false);
    expect(sanitizeAnswers({ allowedPlayers: 'x'.repeat(3001) }).allowedPlayers).toBeUndefined();
  });

  it('the review text lists the names, or says None', () => {
    const q = QUESTIONS.find((x) => x.id === 'allowedPlayers')!;
    expect(answerText(q, 'Alex\nSteve_01', MESSAGES.en)).toBe('Alex, Steve_01');
    expect(answerText(q, '', MESSAGES.en)).toBe('None');
    expect(answerText(q, '', MESSAGES['zh-hant'])).toBe('無');
  });
});
