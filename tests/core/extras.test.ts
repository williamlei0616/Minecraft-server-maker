import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BundleError, buildBundle } from '../../src/core/bundle';
import { defaultConfig, validate } from '../../src/core/config';
import {
  checkExtraProperties,
  isSecretKey,
  overridesFromText,
  parseEditorText,
  propertyKind,
} from '../../src/core/extras';
import { parseProperties } from '../../src/core/javaProperties.mjs';
import { planProperties, renderServerProperties } from '../../src/core/properties';
import type { ServerConfig, VersionProfile, VersionsFile } from '../../src/core/types';

const PUBLIC = new URL('../../public/', import.meta.url);
const profile = (id: string): VersionProfile =>
  JSON.parse(readFileSync(new URL(`profiles/${id}.json`, PUBLIC), 'utf8'));
const versions = JSON.parse(readFileSync(new URL('versions.json', PUBLIC), 'utf8')) as VersionsFile;
const cfg = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  ...defaultConfig(versions),
  versionId: '26.3',
  eulaAccepted: true,
  ...over,
});
const baseOf = (p: VersionProfile) => planProperties(p, cfg()).entries;
const codes = (p: VersionProfile, extra: Record<string, string>) =>
  checkExtraProperties(p, extra).map((i) => `${i.level}:${i.code}:${i.key}`);

describe('propertyKind', () => {
  it('reads the kind from the version default', () => {
    expect(propertyKind('true')).toBe('boolean');
    expect(propertyKind('false')).toBe('boolean');
    expect(propertyKind('25565')).toBe('integer');
    expect(propertyKind('-1')).toBe('integer');
    expect(propertyKind('')).toBe('text');
    expect(propertyKind('A Minecraft Server')).toBe('text');
    expect(propertyKind('1.5')).toBe('text');
  });

  it('is stable: no key changes kind between any two committed versions', () => {
    const kinds = new Map<string, Set<string>>();
    const dir = new URL('profiles/', PUBLIC);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const p = JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as VersionProfile;
      for (const e of p.properties) {
        const set = kinds.get(e.key) ?? new Set<string>();
        set.add(propertyKind(e.default));
        kinds.set(e.key, set);
      }
    }
    const mixed = [...kinds].filter(([, s]) => s.size > 1).map(([k]) => k);
    expect(mixed).toEqual([]);
  });
});

describe('checkExtraProperties (against the real 26.3 profile)', () => {
  const p = profile('26.3');

  it('accepts good values', () => {
    expect(
      codes(p, {
        'max-chained-neighbor-updates': '1000000',
        'max-tick-time': '-1',
        'allow-flight': 'TRUE',
        'region-file-compression': 'lz4',
        'bug-report-link': 'https://example.com/report',
      }),
    ).toEqual([]);
  });

  it('flags a key this version does not have', () => {
    expect(codes(p, { 'no-such-setting': '1' })).toEqual(['error:unknownKey:no-such-setting']);
    // enable-command-block moved into a game rule in 1.21.9, so 26.3 has no such line
    expect(codes(p, { 'enable-command-block': 'true' })).toEqual([
      'error:unknownKey:enable-command-block',
    ]);
    expect(codes(profile('1.18.2'), { 'enable-command-block': 'true' })).toEqual([]);
  });

  it('flags the wrong kind of value', () => {
    expect(codes(p, { pvp: 'yes' })).toEqual(['error:unknownKey:pvp']); // 26.3 has no pvp line
    expect(codes(profile('1.18.2'), { pvp: 'yes' })).toEqual(['error:notBoolean:pvp']);
    expect(codes(p, { 'allow-flight': 'yes' })).toEqual(['error:notBoolean:allow-flight']);
    expect(codes(p, { 'max-players': 'many' })).toEqual(['error:notInteger:max-players']);
    expect(codes(p, { 'max-players': '1.5' })).toEqual(['error:notInteger:max-players']);
    expect(codes(p, { 'max-players': '99999999999' })).toEqual(['error:outOfRange:max-players']);
  });

  it('knows a few limits and choices', () => {
    expect(codes(p, { 'view-distance': '2' })).toEqual(['error:outOfRange:view-distance']);
    expect(codes(p, { 'view-distance': '32' })).toEqual([]);
    expect(codes(p, { 'op-permission-level': '5' })).toEqual([
      'error:outOfRange:op-permission-level',
    ]);
    expect(codes(p, { difficulty: 'impossible' })).toEqual(['error:notOneOf:difficulty']);
    expect(codes(p, { difficulty: 'Hard' })).toEqual([]);
    expect(codes(p, { 'region-file-compression': 'zip' })).toEqual([
      'error:notOneOf:region-file-compression',
    ]);
  });

  it('warns, without blocking, about settings that open the server up', () => {
    expect(codes(p, { 'online-mode': 'false' })).toEqual(['warning:riskOnlineMode:online-mode']);
    expect(codes(p, { 'online-mode': 'true' })).toEqual([]);
    expect(codes(p, { 'enable-rcon': 'true' })).toEqual(['warning:riskRcon:enable-rcon']);
    expect(codes(p, { 'enable-jmx-monitoring': 'true' })).toEqual([
      'warning:riskJmx:enable-jmx-monitoring',
    ]);
    expect(codes(p, { 'management-server-enabled': 'true' })).toEqual([
      'warning:riskManagement:management-server-enabled',
    ]);
    expect(codes(p, { 'server-ip': '10.0.0.5' })).toEqual(['warning:riskServerIp:server-ip']);
    expect(codes(p, { 'server-ip': '' })).toEqual([]);
    expect(codes(p, { 'network-compression-threshold': '-1' })).toEqual([
      'warning:riskCompression:network-compression-threshold',
    ]);
  });

  it('says a randomized key is never written', () => {
    expect(codes(p, { 'management-server-secret': 'abc' })).toEqual([
      'warning:volatile:management-server-secret',
    ]);
  });

  it('rejects overlong values', () => {
    expect(codes(p, { motd: 'x'.repeat(1001) })).toEqual(['error:tooLong:motd']);
  });
});

describe('parseEditorText', () => {
  const p = profile('26.3');
  const base = baseOf(p);
  const fileText = (extra: Record<string, string> = {}) =>
    renderServerProperties(planProperties(p, cfg({ extraProperties: extra })));

  it('the unedited file has no overrides and no issues', () => {
    const r = parseEditorText(fileText(), p, base);
    expect(r.overrides).toEqual({});
    expect(r.issues).toEqual([]);
  });

  it('only lines that differ from the generated file become overrides', () => {
    const text = fileText().replace('max-tick-time=60000', 'max-tick-time=120000');
    const r = parseEditorText(text, p, base);
    expect(r.overrides).toEqual({ 'max-tick-time': '120000' });
  });

  it('a deleted line goes back to the generated value', () => {
    const lines = fileText({ 'max-tick-time': '5' }).split('\n');
    const without = lines.filter((l) => !l.startsWith('max-tick-time')).join('\n');
    expect(parseEditorText(without, p, base).overrides).toEqual({});
  });

  it('reports lines that are not key=value, with their line numbers, and ignores them', () => {
    const r = parseEditorText('#hello\nmax-players=5\nthis is not a setting\n', p, base);
    expect(r.overrides).toEqual({ 'max-players': '5' });
    expect(r.issues).toEqual([
      { level: 'error', code: 'syntax', key: 'this is not a setting', line: 3 },
    ]);
  });

  it('reports a repeated key and keeps the first', () => {
    const r = parseEditorText('max-players=5\nmax-players=6\n', p, base);
    expect(r.overrides).toEqual({ 'max-players': '5' });
    expect(r.issues).toEqual([{ level: 'error', code: 'duplicate', key: 'max-players', line: 2 }]);
  });

  it('keeps an unknown key as an override, so the error stays until the line is removed', () => {
    const r = parseEditorText('made-up=1\n', p, base);
    expect(r.overrides).toEqual({ 'made-up': '1' });
    expect(r.issues.map((i) => i.code)).toEqual(['unknownKey']);
    expect(codes(p, r.overrides)).toEqual(['error:unknownKey:made-up']);
  });

  it('a value that is wrong for its kind is an override with an error', () => {
    const r = parseEditorText('allow-flight=maybe\n', p, base);
    expect(r.overrides).toEqual({ 'allow-flight': 'maybe' });
    expect(r.issues).toEqual([
      { level: 'error', code: 'notBoolean', key: 'allow-flight', line: 1 },
    ]);
  });

  it('understands escapes the way the real file writes them', () => {
    const r = parseEditorText('level-type=minecraft\\:flat\nmotd=Hello\\u0021\n', p, base);
    expect(r.overrides).toEqual({ 'level-type': 'minecraft:flat', motd: 'Hello!' });
  });

  it('survives hostile text', () => {
    const r = parseEditorText('=\n\\\nmotd=\\uZZZZ\n:::\n' + 'x'.repeat(5000), p, base);
    expect(r.issues.every((i) => i.code === 'syntax')).toBe(true);
    expect(r.overrides).toEqual({});
  });
});

describe('overrides in the generated file', () => {
  it('win over the questions and the allow-list choice, and are listed', () => {
    const p = profile('26.3');
    const plan = planProperties(
      p,
      cfg({
        maxPlayers: 20,
        whitelist: true,
        opUsername: 'Notch',
        extraProperties: { 'max-players': '7', 'enforce-whitelist': 'false', 'no-such-key': '1' },
      }),
    );
    const map = new Map(plan.entries.map((e) => [e.key, e.value]));
    expect(map.get('max-players')).toBe('7');
    expect(map.get('enforce-whitelist')).toBe('false');
    expect(map.has('no-such-key')).toBe(false);
    expect(plan.overridden).toEqual(['max-players', 'enforce-whitelist']);
    expect(plan.ignored).toEqual(['no-such-key']);
  });

  it('never write a randomized key even if asked', () => {
    const p = profile('26.3');
    const plan = planProperties(p, cfg({ extraProperties: { 'management-server-secret': 'x' } }));
    expect(plan.entries.some((e) => e.key === 'management-server-secret')).toBe(false);
    expect(plan.ignored).toEqual(['management-server-secret']);
  });

  it('a hostile value cannot add a key', () => {
    const p = profile('26.3');
    const text = renderServerProperties(
      planProperties(
        p,
        cfg({ extraProperties: { 'bug-report-link': 'x\nop-permission-level=0' } }),
      ),
    );
    const map = new Map(parseProperties(text).map((e) => [e.key, e.value]));
    expect(map.get('op-permission-level')).toBe('4');
    expect(map.get('bug-report-link')).toBe('x\nop-permission-level=0');
  });

  it('every committed version accepts an untouched file as zero overrides', () => {
    const dir = new URL('profiles/', PUBLIC);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const p = JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as VersionProfile;
      const plan = planProperties(p, cfg({ versionId: p.id }));
      const r = parseEditorText(renderServerProperties(plan), p, plan.entries);
      expect(r, p.id).toEqual({ overrides: {}, issues: [] });
    }
  });
});

describe('validate (extra settings without a profile)', () => {
  const detail = (extra: Record<string, string>) => {
    const r = validate(cfg({ extraProperties: extra }), versions.versions);
    return r.ok ? undefined : r.details.extraProperties;
  };

  it('accepts none and ordinary ones', () => {
    expect(detail({})).toBeUndefined();
    expect(detail({ 'max-tick-time': '5', 'rcon.password': 'p w' })).toBeUndefined();
  });

  it('refuses unusable keys, values and too many lines', () => {
    expect(detail({ 'bad key': '1' })?.code).toBe('extraKey');
    expect(detail({ [`k${'x'.repeat(70)}`]: '1' })?.code).toBe('extraKey');
    expect(detail({ motd: 'a\nb' })).toEqual({ code: 'extraValue', value: 'motd' });
    expect(detail({ motd: 'x'.repeat(1001) })?.code).toBe('extraValue');
    const many = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`key${i}`, '1']));
    expect(detail(many)).toEqual({ code: 'extraTooMany', max: 100 });
  });

  it('refuses a non-object', () => {
    expect(detail('x' as unknown as Record<string, string>)?.code).toBe('extraKey');
    expect(detail(null as unknown as Record<string, string>)?.code).toBe('extraKey');
  });
});

describe('helpers', () => {
  it('overridesFromText reads saved answer text and never throws', () => {
    expect(overridesFromText('a=1\nb=two words\n')).toEqual({ a: '1', b: 'two words' });
    expect(overridesFromText('a=\\uZZ')).toEqual({});
  });

  it('isSecretKey finds passwords and secrets', () => {
    expect(isSecretKey('rcon.password')).toBe(true);
    expect(isSecretKey('management-server-secret')).toBe(true);
    expect(isSecretKey('management-server-tls-keystore-password')).toBe(true);
    expect(isSecretKey('motd')).toBe(false);
  });
});

describe('buildBundle with extra settings', () => {
  const fileFetch = (async (url: string) => {
    try {
      return new Response(readFileSync(new URL(`.${url}`, PUBLIC)));
    } catch {
      return new Response('', { status: 404 });
    }
  }) as unknown as typeof fetch;

  it('refuses settings this version cannot take, instead of dropping them silently', async () => {
    await expect(
      buildBundle(cfg({ extraProperties: { 'made-up': '1' } }), versions.versions, {
        fetch: fileFetch,
      }),
    ).rejects.toBeInstanceOf(BundleError);
    await expect(
      buildBundle(cfg({ extraProperties: { 'max-tick-time': 'soon' } }), versions.versions, {
        fetch: fileFetch,
      }),
    ).rejects.toBeInstanceOf(BundleError);
  });

  it('builds with a good edit and a warning-level one', async () => {
    const blob = await buildBundle(
      cfg({ extraProperties: { 'max-tick-time': '120000', 'online-mode': 'false' } }),
      versions.versions,
      { fetch: fileFetch },
    );
    expect(blob.size).toBeGreaterThan(1000);
  });
});
