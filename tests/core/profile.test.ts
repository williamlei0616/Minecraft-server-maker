import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildLaunch, formatCommand, LaunchError } from '../../src/core/launch';
import { ProfileError, loadProfile, parseProfile, profileUrl } from '../../src/core/profile';
import type { VersionEntry, VersionProfile, VersionsFile } from '../../src/core/types';

const PUBLIC = new URL('../../public/', import.meta.url);
const profile = (id: string): VersionProfile =>
  JSON.parse(readFileSync(new URL(`profiles/${id}.json`, PUBLIC), 'utf8'));
const versionsFile = JSON.parse(
  readFileSync(new URL('versions.json', PUBLIC), 'utf8'),
) as VersionsFile;
const entry = (id: string): VersionEntry => versionsFile.versions.find((v) => v.id === id)!;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('repository data invariant', () => {
  it('every version in versions.json has a current profile, and there are no orphans', () => {
    const files = readdirSync(new URL('profiles/', PUBLIC))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5));
    expect(files.sort()).toEqual(versionsFile.versions.map((v) => v.id).sort());
    for (const v of versionsFile.versions) {
      const p = parseProfile(profile(v.id));
      expect(p.id).toBe(v.id);
      expect(p.jarSha1).toBe(v.jar.sha1);
      expect(p.javaMajor).toBe(v.javaMajor);
      expect(p.launch.bundler).toBe(true);
    }
  });
});

describe('profileUrl', () => {
  it('joins the base with the id, encoded', () => {
    expect(profileUrl('26.3')).toBe('/profiles/26.3.json');
    expect(profileUrl('26.3', '/Minecraft-server-maker/')).toBe(
      '/Minecraft-server-maker/profiles/26.3.json',
    );
    expect(profileUrl('a b/c')).toBe('/profiles/a%20b%2Fc.json');
  });
});

describe('parseProfile', () => {
  const good = () => structuredClone(profile('26.3')) as unknown as Record<string, unknown>;

  it('accepts a real profile', () => {
    expect(parseProfile(good()).id).toBe('26.3');
  });

  it('rejects broken shapes with a ProfileError', () => {
    const cases: Record<string, (p: Record<string, unknown>) => void> = {
      'wrong schema': (p) => (p.schema = 2),
      'bad sha': (p) => (p.jarSha1 = 'nope'),
      'no properties': (p) => (p.properties = []),
      'property without default': (p) => (p.properties = [{ key: 'server-port' }]),
      'bad nogui': (p) => ((p.launch as Record<string, unknown>).nogui = '-nogui'),
      'templated volatile key': (p) => (p.volatile = ['motd']),
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const p = good();
      mutate(p);
      expect(() => parseProfile(p), name).toThrow(ProfileError);
    }
    expect(() => parseProfile(null)).toThrow(ProfileError);
    expect(() => parseProfile([])).toThrow(ProfileError);
  });

  it('rejects duplicate keys', () => {
    const p = good();
    const props = p.properties as { key: string; default: string }[];
    props.push({ ...props[0]! });
    expect(() => parseProfile(p)).toThrow(/duplicate/);
  });
});

describe('loadProfile', () => {
  const e = entry('26.3');

  it('loads a matching profile and asks the right URL', async () => {
    let asked = '';
    const p = await loadProfile(e, {
      baseUrl: '/base',
      fetch: (async (u: string) => ((asked = u), json(profile('26.3')))) as unknown as typeof fetch,
    });
    expect(asked).toBe('/base/profiles/26.3.json');
    expect(p.id).toBe('26.3');
  });

  const codeOf = async (fetchImpl: unknown, ent = e) => {
    try {
      await loadProfile(ent, { fetch: fetchImpl as typeof fetch });
      return 'ok';
    } catch (err) {
      return err instanceof ProfileError ? err.code : 'other';
    }
  };

  it('classifies failures', async () => {
    expect(await codeOf(async () => new Response('', { status: 404 }))).toBe('missing');
    expect(await codeOf(async () => new Response('', { status: 500 }))).toBe('network');
    expect(
      await codeOf(async () => {
        throw new Error('offline');
      }),
    ).toBe('network');
    expect(await codeOf(async () => new Response('<html>', { status: 200 }))).toBe('shape');
    expect(await codeOf(async () => json({ schema: 1 }))).toBe('shape');
  });

  it('refuses a profile for a different jar', async () => {
    const wrong = { ...profile('26.3'), jarSha1: 'a'.repeat(40) };
    expect(await codeOf(async () => json(wrong))).toBe('mismatch');
    expect(await codeOf(async () => json(profile('26.2')))).toBe('mismatch');
  });
});

describe('buildLaunch', () => {
  it('no GUI adds the version-correct flag; GUI adds none', () => {
    const p = profile('1.18.2');
    expect(buildLaunch(p, { ramGb: 4, gui: false }).jarArgs).toEqual(['--nogui']);
    expect(buildLaunch(p, { ramGb: 4, gui: true }).jarArgs).toEqual([]);
  });

  it('carries the Java requirement and RAM', () => {
    const spec = buildLaunch(profile('26.3'), { ramGb: 8, gui: false });
    expect(spec.javaMajor).toBe(25);
    expect(formatCommand(spec)).toBe('java -Xms1G -Xmx8G -jar server.jar --nogui');
    expect(formatCommand(buildLaunch(profile('1.18.2'), { ramGb: 1, gui: true }))).toBe(
      'java -Xms1G -Xmx1G -jar server.jar',
    );
    expect(buildLaunch(profile('1.18.2'), { ramGb: 2, gui: true }).javaMajor).toBe(17);
  });

  it('refuses a jar that is not a bundler (our scripts cannot start it)', () => {
    const p = profile('26.3');
    p.launch.bundler = false;
    expect(() => buildLaunch(p, { ramGb: 4, gui: true })).toThrow(LaunchError);
  });

  it('the launch shape is the same for every supported version (what really differs is Java)', () => {
    const javas = new Set<number>();
    for (const v of versionsFile.versions) {
      const p = profile(v.id);
      expect(p.launch.nogui).toBe('--nogui');
      expect(existsSync(new URL(`profiles/${v.id}.json`, PUBLIC))).toBe(true);
      javas.add(p.javaMajor);
    }
    expect([...javas].sort((a, b) => a - b)).toEqual([17, 21, 25]);
  });
});
