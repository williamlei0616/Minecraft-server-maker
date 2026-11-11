import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  backfillDataVersion,
  chooseJava,
  extractProfile,
  javaCandidates,
  missingProfiles,
  parseJavaMajor,
  updateProfiles,
} from '../../scripts/build-profiles.mjs';
import {
  buildProfile,
  findVolatileKeys,
  parseHelpOptions,
  profileIsCurrent,
  worldVersionOf,
} from '../../scripts/lib/profile.mjs';

const fx = (name) => readFileSync(new URL(`../fixtures/profiles/${name}`, import.meta.url), 'utf8');
const SECRET = /^(management-server-secret=).*$/m;
const withSecret = (text, value) => text.replace(SECRET, `$1${value}`);

const entryFor = (id, javaMajor, jar = Buffer.from('fake jar')) => ({
  id,
  type: 'release',
  releaseTime: '2026-01-01T00:00:00+00:00',
  jar: {
    url: `https://piston-data.mojang.com/v1/objects/x/server.jar`,
    sha1: createHash('sha1').update(jar).digest('hex'),
    size: jar.length,
  },
  javaMajor,
});

describe('parseHelpOptions', () => {
  it('reads option names from real --help tables', () => {
    const opts = parseHelpOptions(fx('26.3.help.txt'));
    expect(opts).toContain('--nogui');
    expect(opts).toContain('--initSettings');
    expect(opts).toContain('--pidFile');
    expect(opts).not.toContain('Option');
  });
  it('shows what changed between versions (pidFile arrives after 1.18.2)', () => {
    expect(parseHelpOptions(fx('1.18.2.help.txt'))).not.toContain('--pidFile');
    expect(parseHelpOptions(fx('1.21.4.help.txt'))).toContain('--pidFile');
  });
});

describe('findVolatileKeys', () => {
  it('flags keys that differ or exist in only one run', () => {
    const a = [
      { key: 'x', value: '1' },
      { key: 's', value: 'aaa' },
      { key: 'only-a', value: '1' },
    ];
    const b = [
      { key: 'x', value: '1' },
      { key: 's', value: 'bbb' },
      { key: 'only-b', value: '1' },
    ];
    expect(findVolatileKeys(a, b).sort()).toEqual(['only-a', 'only-b', 's']);
  });
});

describe('buildProfile on real files', () => {
  const make = (id, java) => {
    const a = fx(`${id}.server.properties`);
    const b = withSecret(a, 'a-different-random-value');
    return buildProfile({
      entry: entryFor(id, java),
      propertiesA: a,
      propertiesB: b,
      helpText: fx(`${id}.help.txt`),
      bundler: true,
    });
  };
  const def = (p, key) => p.properties.find((e) => e.key === key)?.default;
  const has = (p, key) => p.properties.some((e) => e.key === key);

  it('26.3: leaves out the random management secret and keeps real defaults', () => {
    const p = make('26.3', 25);
    expect(p.volatile).toEqual(['management-server-secret']);
    expect(has(p, 'management-server-secret')).toBe(false);
    expect(def(p, 'white-list')).toBe('true'); // default flipped in 26.3
    expect(def(p, 'level-type')).toBe('minecraft:normal');
    expect(p.launch).toMatchObject({ bundler: true, nogui: '--nogui' });
    expect(p.javaMajor).toBe(25);
    expect(p.schema).toBe(1);
  });

  it('1.18.2 still has the keys that later became game rules', () => {
    const p = make('1.18.2', 17);
    for (const k of [
      'enable-command-block',
      'pvp',
      'allow-nether',
      'spawn-monsters',
      'simulation-distance',
    ]) {
      expect(has(p, k)).toBe(true);
    }
    expect(def(p, 'enable-command-block')).toBe('false');
    expect(def(p, 'level-type')).toBe('default');
    expect(p.volatile).toEqual([]);
  });

  it('1.21.11 no longer has them (they moved to game rules in 1.21.9)', () => {
    const p = make('1.21.11', 21);
    for (const k of ['enable-command-block', 'pvp', 'allow-nether', 'spawn-monsters']) {
      expect(has(p, k)).toBe(false);
    }
    expect(has(p, 'simulation-distance')).toBe(true);
    expect(p.volatile).toEqual(['management-server-secret']);
  });

  it('keeps the order the server wrote', () => {
    const p = make('1.21.4', 21);
    const fileOrder = fx('1.21.4.server.properties')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split('=')[0]);
    expect(p.properties.map((e) => e.key)).toEqual(fileOrder);
  });

  it('refuses an incomplete first run', () => {
    expect(() =>
      buildProfile({
        entry: entryFor('x', 17),
        propertiesA: 'a=1\n',
        propertiesB: 'a=1\n',
        helpText: '--nogui',
        bundler: true,
      }),
    ).toThrow(/incomplete/);
  });

  it('falls back to bare "nogui" when --nogui is not listed', () => {
    const a = fx('1.18.2.server.properties');
    const p = buildProfile({
      entry: entryFor('old', 17),
      propertiesA: a,
      propertiesB: a,
      helpText: '--help\n--port <Integer>\n',
      bundler: true,
    });
    expect(p.launch.nogui).toBe('nogui');
  });

  it('profileIsCurrent checks id, schema and jar hash', () => {
    const p = make('26.3', 25);
    const rebuiltJar = entryFor('26.3', 25, Buffer.from('a re-released jar'));
    expect(profileIsCurrent(p, entryFor('26.3', 25))).toBe(true);
    expect(profileIsCurrent(p, rebuiltJar)).toBe(false); // jar changed upstream -> regenerate
    expect(profileIsCurrent({ ...p, schema: 2 }, entryFor('26.3', 25))).toBe(false);
    expect(profileIsCurrent({ ...p, id: 'other' }, entryFor('26.3', 25))).toBe(false);
    expect(profileIsCurrent(null, entryFor('26.3', 25))).toBe(false);
  });
});

describe('Java discovery', () => {
  it('parses old and new version strings', () => {
    expect(parseJavaMajor('java version "1.8.0_481"')).toBe(8);
    expect(parseJavaMajor('openjdk version "25.0.5" 2026-10-20 LTS')).toBe(25);
    expect(parseJavaMajor('java version "21.0.7" 2025-04-15 LTS')).toBe(21);
    expect(parseJavaMajor('nonsense')).toBeNull();
  });

  it('reads candidates from MCSM_JAVA_<n> and JAVA_HOME_<n>_X64', () => {
    const c = javaCandidates({
      MCSM_JAVA_25: '/jdk25/bin/java',
      JAVA_HOME_17_X64: '/jdk17',
      FOO: 'x',
    });
    expect(c).toContain('/jdk25/bin/java');
    expect(c.some((p) => p.replaceAll('\\', '/').startsWith('/jdk17/bin/java'))).toBe(true);
    expect(c).toContain('java');
  });

  it('chooses the smallest Java that is new enough', async () => {
    const probe = async (bin) => ({ a: 17, b: 21, c: 25, d: null })[bin];
    expect(await chooseJava(21, ['a', 'b', 'c', 'd'], probe)).toEqual({ bin: 'b', major: 21 });
    expect(await chooseJava(17, ['c', 'b', 'a'], probe)).toEqual({ bin: 'a', major: 17 });
    expect(await chooseJava(26, ['a', 'b', 'c'], probe)).toBeNull();
  });
});

describe('extractProfile (with fake download and Java)', () => {
  function fakeDeps(overrides = {}) {
    const dirs = [];
    let initRuns = 0;
    const deps = {
      download: async () => Buffer.from('fake jar'),
      hasBundlerMarker: async () => true,
      chooseJava: async () => ({ bin: 'java', major: 25 }),
      runJava: async ({ cwd, args }) => {
        dirs.push(cwd);
        if (args.includes('--help')) return { status: 0, stdout: fx('26.3.help.txt'), stderr: '' };
        initRuns++;
        expect(existsSync(join(cwd, 'server.jar'))).toBe(true);
        writeFileSync(
          join(cwd, 'server.properties'),
          withSecret(fx('26.3.server.properties'), `random-${initRuns}`),
        );
        writeFileSync(join(cwd, 'eula.txt'), fx('26.3.eula.txt'));
        return { status: 0, stdout: '', stderr: '' };
      },
      ...overrides,
    };
    return { deps, dirs };
  }

  it('produces a profile and deletes every throwaway directory', async () => {
    const { deps, dirs } = fakeDeps();
    const p = await extractProfile(entryFor('26.3', 25), deps);
    expect(p.id).toBe('26.3');
    expect(p.volatile).toEqual(['management-server-secret']);
    expect(dirs.length).toBeGreaterThanOrEqual(3);
    for (const d of dirs) expect(existsSync(d)).toBe(false);
  });

  it('rejects a jar whose sha1 does not match', async () => {
    const { deps } = fakeDeps({ download: async () => Buffer.from('tampered') });
    const entry = { ...entryFor('26.3', 25), jar: { ...entryFor('26.3', 25).jar, size: 8 } };
    await expect(extractProfile(entry, deps)).rejects.toThrow(/sha1 mismatch/);
  });

  it('rejects a jar of the wrong size before running anything', async () => {
    const runJava = vi.fn();
    const { deps } = fakeDeps({ download: async () => Buffer.from('longer jar bytes'), runJava });
    await expect(extractProfile(entryFor('26.3', 25), deps)).rejects.toThrow(/bytes, expected/);
    expect(runJava).not.toHaveBeenCalled();
  });

  it('fails clearly when no suitable Java is installed', async () => {
    const { deps } = fakeDeps({ chooseJava: async () => null });
    await expect(extractProfile(entryFor('26.3', 25), deps)).rejects.toThrow(/no Java 25\+/);
  });

  it('fails when --initSettings fails or writes nothing', async () => {
    await expect(
      extractProfile(
        entryFor('26.3', 25),
        fakeDeps({ runJava: async () => ({ status: 1, stdout: '', stderr: 'boom' }) }).deps,
      ),
    ).rejects.toThrow(/exited 1/);
    await expect(
      extractProfile(
        entryFor('26.3', 25),
        fakeDeps({ runJava: async () => ({ status: 0, stdout: '', stderr: '' }) }).deps,
      ),
    ).rejects.toThrow(/wrote no server.properties/);
  });

  it('fails if eula.txt ever says true (we must never accept it for anyone)', async () => {
    const { deps } = fakeDeps({
      runJava: async ({ cwd }) => {
        writeFileSync(join(cwd, 'server.properties'), fx('26.3.server.properties'));
        writeFileSync(join(cwd, 'eula.txt'), 'eula=true\n');
        return { status: 0, stdout: '', stderr: '' };
      },
    });
    await expect(extractProfile(entryFor('26.3', 25), deps)).rejects.toThrow(/eula/);
  });
});

describe('updateProfiles', () => {
  const entries = ['26.3', '1.21.4', '1.18.2'].map((id) => entryFor(id, 21));
  const profileFor = (e) => ({
    schema: 1,
    id: e.id,
    jarSha1: e.jar.sha1,
    dataVersion: 1,
    properties: [],
  });

  function store(initial = {}) {
    const files = { ...initial };
    return {
      files,
      readProfile: (id) => files[id] ?? null,
      writeProfile: (id, p) => (files[id] = p),
      listProfileIds: () => Object.keys(files),
      removeProfile: (id) => delete files[id],
    };
  }

  it('creates only the missing or outdated profiles', async () => {
    const s = store({
      26.3: profileFor(entries[0]),
      '1.21.4': { ...profileFor(entries[1]), jarSha1: 'stale' },
    });
    const extract = vi.fn(async (e) => profileFor(e));
    const r = await updateProfiles({ versions: entries, ...s, extract });
    expect(extract.mock.calls.map((c) => c[0].id).sort()).toEqual(['1.18.2', '1.21.4']);
    expect(r.written).toEqual(['1.18.2', '1.21.4']);
    expect(r.upToDate).toBe(1);
    expect(missingProfiles(entries, s.readProfile)).toEqual([]);
  });

  it('removes profiles of versions that left the list, but only after full success', async () => {
    const orphan = { schema: 1, id: 'gone', jarSha1: 'x' };
    const ok = store({ gone: orphan });
    const r1 = await updateProfiles({
      versions: entries,
      ...ok,
      extract: async (e) => profileFor(e),
    });
    expect(r1.removed).toEqual(['gone']);
    expect(ok.files.gone).toBeUndefined();

    const bad = store({ gone: orphan });
    const r2 = await updateProfiles({
      versions: entries,
      ...bad,
      extract: async (e) => {
        if (e.id === '1.21.4') throw new Error('nope');
        return profileFor(e);
      },
    });
    expect(r2.failures).toEqual([{ id: '1.21.4', message: 'nope' }]);
    expect(r2.removed).toEqual([]);
    expect(bad.files.gone).toBeDefined();
  });
});

describe('the world format version (dataVersion)', () => {
  const entries = ['26.3', '1.21.4'].map((id) => entryFor(id, 21));
  const old = (e) => ({
    schema: 1,
    id: e.id,
    jarSha1: e.jar.sha1,
    javaMajor: 21,
    launch: { bundler: true, nogui: '--nogui', options: [] },
    properties: [{ key: 'motd', default: 'x' }],
    volatile: [],
  });

  it('worldVersionOf reads world_version and nothing else', () => {
    expect(worldVersionOf({ world_version: 4189 })).toBe(4189);
    expect(worldVersionOf({ world_version: '4189' })).toBeNull();
    expect(worldVersionOf({ world_version: 0 })).toBeNull();
    expect(worldVersionOf({})).toBeNull();
    expect(worldVersionOf(null)).toBeNull();
  });

  it('buildProfile records it when given and omits it otherwise', () => {
    const base = {
      entry: entryFor('26.3', 25),
      propertiesA: fx('26.3.server.properties'),
      propertiesB: fx('26.3.server.properties'),
      helpText: fx('26.3.help.txt'),
      bundler: true,
    };
    expect(buildProfile({ ...base, dataVersion: 5023 }).dataVersion).toBe(5023);
    expect('dataVersion' in buildProfile(base)).toBe(false);
  });

  it('a current profile without it is reported missing, and gets it without re-running Java', async () => {
    const files = Object.fromEntries(entries.map((e) => [e.id, old(e)]));
    expect(missingProfiles(entries, (id) => files[id])).toEqual(['26.3', '1.21.4']);
    const extract = vi.fn();
    const backfill = vi.fn(async (e, p) => ({ ...p, dataVersion: e.id === '26.3' ? 5023 : 4189 }));
    const r = await updateProfiles({
      versions: entries,
      readProfile: (id) => files[id] ?? null,
      writeProfile: (id, p) => (files[id] = p),
      listProfileIds: () => Object.keys(files),
      removeProfile: () => {},
      extract,
      backfill,
    });
    expect(extract).not.toHaveBeenCalled();
    expect(r.written).toEqual(['1.21.4', '26.3']);
    expect(files['26.3'].dataVersion).toBe(5023);
    expect(missingProfiles(entries, (id) => files[id])).toEqual([]);
  });

  it('backfillDataVersion checks the jar and keeps every other field', async () => {
    const e = entryFor('26.3', 25);
    const jar = Buffer.from('fake jar');
    const entry = { ...e, jar: { ...e.jar, sha1: createHash('sha1').update(jar).digest('hex') } };
    const deps = { download: async () => jar, readDataVersion: async () => 5023 };
    const p = await backfillDataVersion(entry, old(entry), deps);
    expect(p).toEqual({ ...old(entry), dataVersion: 5023 });
    await expect(
      backfillDataVersion(entry, old(entry), { ...deps, download: async () => Buffer.from('x') }),
    ).rejects.toThrow(/sha1 mismatch/);
    await expect(
      backfillDataVersion(entry, old(entry), { ...deps, readDataVersion: async () => null }),
    ).rejects.toThrow(/no world_version/);
  });

  it('the committed profiles all have it, and it never rises as versions get older', () => {
    const dir = new URL('../../public/', import.meta.url);
    const list = JSON.parse(readFileSync(new URL('versions.json', dir), 'utf8')).versions;
    const numbers = list.map((v) => {
      const p = JSON.parse(readFileSync(new URL('profiles/' + v.id + '.json', dir), 'utf8'));
      return [v.id, p.dataVersion];
    });
    for (const [id, n] of numbers) expect(Number.isInteger(n), id).toBe(true);
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i][1], numbers[i][0]).toBeLessThanOrEqual(numbers[i - 1][1]);
    }
  });
});
