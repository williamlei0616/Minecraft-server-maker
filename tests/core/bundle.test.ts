import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  BundleError,
  buildBundle,
  buildBundleFiles,
  bundleFolderName,
  zipBundle,
} from '../../src/core/bundle';
import { defaultConfig } from '../../src/core/config';
import {
  ScriptInputError,
  needsPlayersStep,
  renderPlayersPs1,
  renderStartBat,
  renderStartSh,
  type ScriptInput,
} from '../../src/core/scripts';
import type {
  ServerConfig,
  VersionEntry,
  VersionProfile,
  VersionsFile,
} from '../../src/core/types';

const PUBLIC = new URL('../../public/', import.meta.url);
const versions = JSON.parse(readFileSync(new URL('versions.json', PUBLIC), 'utf8')) as VersionsFile;
const profile = (id: string) =>
  JSON.parse(readFileSync(new URL(`profiles/${id}.json`, PUBLIC), 'utf8')) as VersionProfile;
const entry = (id: string): VersionEntry => versions.versions.find((v) => v.id === id)!;
const cfg = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  ...defaultConfig(versions),
  eulaAccepted: true,
  ...over,
});

const fileFetch = (async (url: string) => {
  try {
    return new Response(readFileSync(new URL(`.${url}`, PUBLIC)));
  } catch {
    return new Response('', { status: 404 });
  }
}) as unknown as typeof fetch;

const scriptInput = (over: Partial<ScriptInput> = {}): ScriptInput => {
  const e = entry('26.3');
  return {
    versionId: e.id,
    jarUrl: e.jar.url,
    jarSha1: e.jar.sha1,
    jarMegabytes: 59,
    javaMajor: 25,
    jvmArgs: ['-Xms1G', '-Xmx4G'],
    jarArgs: ['--nogui'],
    opUsername: '',
    ...over,
  };
};

describe('script safety', () => {
  const unsafe: [string, Partial<ScriptInput>][] = [
    ['version id', { versionId: '1.0 & calc' }],
    ['jar URL host', { jarUrl: 'https://evil.example.com/server.jar' }],
    ['jar URL scheme', { jarUrl: 'http://piston-data.mojang.com/v1/objects/x/server.jar' }],
    [
      'jar URL characters',
      { jarUrl: 'https://piston-data.mojang.com/v1/objects/x/server.jar&calc' },
    ],
    ['sha1', { jarSha1: 'xyz' }],
    ['download size', { jarMegabytes: 0 }],
    ['Java version', { javaMajor: 3 }],
    ['JVM argument', { jvmArgs: ['-Xmx4G', '-javaagent:evil.jar'] }],
    ['jar argument', { jarArgs: ['--nogui; calc'] }],
    ['username', { opUsername: 'a;b' }],
    ['allow list name', { allowedPlayers: ['ok_name', 'a;b'] }],
    ['block list name', { blockedPlayers: ['x y'] }],
    ['blocked address', { blockedIps: ['1.2.3.4; calc'] }],
    ['allow list switch', { whitelist: 'yes' as unknown as boolean }],
    ['allow list', { allowedPlayers: Array.from({ length: 51 }, (_, i) => 'Player' + (i + 10)) }],
  ];
  for (const [what, over] of unsafe) {
    it(`both renderers refuse an unsafe ${what}`, () => {
      expect(() => renderStartBat(scriptInput(over))).toThrow(ScriptInputError);
      expect(() => renderStartSh(scriptInput(over))).toThrow(ScriptInputError);
    });
  }
});

describe('script rendering', () => {
  it('start.bat is CRLF only; start.sh is LF only', () => {
    const bat = renderStartBat(scriptInput());
    const sh = renderStartSh(scriptInput());
    expect(bat.match(/\r\n/g)!.length).toBe(bat.split('\n').length - 1);
    expect(bat.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(sh).not.toContain('\r');
    expect(sh.startsWith('#!/bin/sh\n')).toBe(true);
  });

  it('bakes in the verified values and the right Java requirement', () => {
    const e = entry('26.3');
    for (const text of [renderStartBat(scriptInput()), renderStartSh(scriptInput())]) {
      expect(text).toContain(e.jar.url);
      expect(text).toContain(e.jar.sha1);
      expect(text).toContain('25');
      expect(text).toContain('-Xms1G -Xmx4G');
      expect(text).toContain('--nogui');
      expect(text).toContain('https://adoptium.net/temurin/releases/?version=');
    }
  });

  it('never embeds the jar and never contains a hidden eula=true', () => {
    for (const text of [renderStartBat(scriptInput()), renderStartSh(scriptInput())]) {
      expect(text).not.toMatch(/eula\s*=\s*true/i);
    }
  });

  it('only includes the operator step when a username is given', () => {
    expect(renderStartSh(scriptInput())).toContain("OP_NAME=''");
    const withOp = scriptInput({ opUsername: 'Steve_01' });
    expect(renderStartSh(withOp)).toContain("OP_NAME='Steve_01'");
    expect(renderStartBat(withOp)).toContain('set "OP_NAME=Steve_01"');
  });

  it('the Windows player step runs players.ps1 and the name arrives via the environment', () => {
    const bat = renderStartBat(scriptInput({ opUsername: 'Steve_01' }));
    expect(bat).toContain('-File "%~dp0players.ps1"');
    expect(bat).not.toContain('-EncodedCommand');
    const ps = renderPlayersPs1(scriptInput({ opUsername: 'Steve_01' }));
    expect(ps).toContain('Invoke-RestMethod');
    expect(ps).toContain("'ops.json'");
    expect(ps).toContain('level = 4');
    expect(ps).toContain('$env:OP_NAME');
    expect(ps).not.toContain('Steve_01');
    expect(ps).toContain("$ProgressPreference = 'SilentlyContinue'");
    expect(ps).toContain('lookup/bulk/byname');
    expect(ps.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/); // CRLF only
    expect(ps).toMatch(/^[\x20-\x7e\r\n]*$/); // ASCII only
  });

  it('start scripts without operator or lists have no player step', () => {
    expect(renderStartBat(scriptInput())).not.toContain('players.ps1');
    expect(renderStartSh(scriptInput())).not.toContain('lookup/bulk/byname');
    expect(needsPlayersStep(scriptInput())).toBe(false);
    expect(needsPlayersStep(scriptInput({ opUsername: 'Steve_01' }))).toBe(true);
    expect(needsPlayersStep(scriptInput({ blockedIps: ['1.2.3.4'] }))).toBe(true);
  });

  it('keeps the jar cache and resume behaviour in both scripts', () => {
    const bat = renderStartBat(scriptInput());
    const sh = renderStartSh(scriptInput());
    expect(bat).toContain('%LOCALAPPDATA%\\MinecraftServerMaker\\jars');
    expect(bat).toContain('-C -');
    expect(bat).toContain('MCSM_CACHE_DIR');
    expect(sh).toContain('MinecraftServerMaker/jars');
    expect(sh).toContain('-C -');
    expect(sh).toContain('MCSM_CACHE_DIR');
  });

  it('GUI mode passes no jar argument', () => {
    expect(renderStartSh(scriptInput({ jarArgs: [] }))).toContain("JAR_ARGS=''");
  });
});

describe('bundle files', () => {
  const e = entry('26.3');
  const p = profile('26.3');

  it('adds players.ps1 only when the operator or a list needs it', () => {
    const names = (over: Partial<ServerConfig>) =>
      buildBundleFiles(cfg(over), e, p).map((f) => f.path);
    expect(names({})).not.toContain('players.ps1');
    expect(names({ opUsername: 'Steve_01' })).toContain('players.ps1');
    expect(names({ blockedIps: ['1.2.3.4'] })).toContain('players.ps1');
    expect(names({ whitelist: true, allowedPlayers: ['Alex'] })).toContain('players.ps1');
  });

  it('contains exactly the expected files and never a jar', () => {
    const names = buildBundleFiles(cfg(), e, p).map((f) => f.path);
    expect(names).toEqual(['eula.txt', 'server.properties', 'start.bat', 'start.sh', 'README.txt']);
    expect(names.some((n) => n.endsWith('.jar'))).toBe(false);
  });

  it('writes eula.txt only when the EULA was accepted', () => {
    const accepted = buildBundleFiles(cfg(), e, p).find((f) => f.path === 'eula.txt')!;
    expect(accepted.content).toMatch(/^eula=true$/m);
    expect(buildBundleFiles(cfg({ eulaAccepted: false }), e, p).map((f) => f.path)).not.toContain(
      'eula.txt',
    );
  });

  it('uses the profile for properties and Java, and the player choices for launch', () => {
    const files = buildBundleFiles(
      cfg({ ramGb: 8, gui: false, difficulty: 'hard', port: 25570 }),
      e,
      p,
    );
    const get = (n: string) => files.find((f) => f.path === n)!.content;
    expect(get('server.properties')).toContain('difficulty=hard\n');
    expect(get('server.properties')).toContain('server-port=25570\n');
    expect(get('server.properties')).toContain('white-list=false\n');
    expect(get('start.sh')).toContain("JVM_ARGS='-Xms1G -Xmx8G'");
    expect(get('start.sh')).toContain("JAR_ARGS='--nogui'");
    expect(get('start.sh')).toContain("JAVA_MIN='25'");
    expect(get('README.txt')).toContain('Java 25');
    expect(get('README.txt')).toContain('port 25570');
  });

  it('any whole-GB memory reaches both launchers, including values that were never in the old list', () => {
    for (const ramGb of [1, 6, 10, 24, 128]) {
      const files = buildBundleFiles(cfg({ ramGb }), e, p);
      const get = (n: string) => files.find((f) => f.path === n)!.content;
      expect(get('start.sh'), String(ramGb)).toContain(`JVM_ARGS='-Xms1G -Xmx${ramGb}G'`);
      expect(get('start.bat'), String(ramGb)).toContain(`set "JVM_ARGS=-Xms1G -Xmx${ramGb}G"`);
    }
  });

  it('the README never claims the EULA was accepted when it was not', () => {
    const readme = (accepted: boolean) =>
      buildBundleFiles(cfg({ eulaAccepted: accepted }), e, p).find((f) => f.path === 'README.txt')!
        .content;
    expect(readme(true)).toContain('You accepted the Minecraft EULA');
    expect(readme(false)).not.toContain('You accepted');
    expect(readme(false)).toContain('Minecraft will not run until you accept its EULA');
  });

  it('refuses mismatched inputs', () => {
    expect(() => buildBundleFiles(cfg({ versionId: '1.21.4' }), e, p)).toThrow(BundleError);
    expect(() => buildBundleFiles(cfg(), entry('1.21.4'), p)).toThrow(BundleError);
  });
});

describe('buildBundle (the zip the player downloads)', () => {
  it('produces a zip with the right folder, files, line endings and Unix permissions', async () => {
    const blob = await buildBundle(cfg({ opUsername: 'Steve_01' }), versions.versions, {
      fetch: fileFetch,
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const root = bundleFolderName('26.3');
    const names = Object.keys(zip.files)
      .filter((n) => !zip.files[n]!.dir)
      .sort();
    expect(names).toEqual(
      ['README.txt', 'eula.txt', 'players.ps1', 'server.properties', 'start.bat', 'start.sh'].map(
        (n) => `${root}/${n}`,
      ),
    );

    const sh = zip.file(`${root}/start.sh`)!;
    expect(((sh.unixPermissions as number) & 0o777).toString(8)).toBe('755');
    expect(((zip.file(`${root}/start.bat`)!.unixPermissions as number) & 0o777).toString(8)).toBe(
      '644',
    );
    expect(await zip.file(`${root}/start.bat`)!.async('string')).toContain('\r\n');
    expect(await sh.async('string')).not.toContain('\r');
    expect(blob.size).toBeLessThan(20_000); // a few KB, not a jar
  });

  it('is deterministic: same choices, same bytes', async () => {
    const a = await buildBundle(cfg(), versions.versions, { fetch: fileFetch });
    const b = await buildBundle(cfg(), versions.versions, { fetch: fileFetch });
    expect(Buffer.from(await a.arrayBuffer()).equals(Buffer.from(await b.arrayBuffer()))).toBe(
      true,
    );
  });

  it('refuses without the EULA, with invalid options, and for unknown versions', async () => {
    const code = async (c: ServerConfig) => {
      try {
        await buildBundle(c, versions.versions, { fetch: fileFetch });
        return 'ok';
      } catch (e) {
        return e instanceof BundleError ? e.code : 'other';
      }
    };
    expect(await code(cfg({ eulaAccepted: false }))).toBe('eula');
    expect(await code(cfg({ port: 80 }))).toBe('invalid');
    expect(await code(cfg({ versionId: 'nope' }))).toBe('invalid');
  });

  it('builds a valid bundle for every listed version', async () => {
    for (const v of versions.versions) {
      const blob = await buildBundle(cfg({ versionId: v.id }), versions.versions, {
        fetch: fileFetch,
      });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const sh = await zip.file(`${bundleFolderName(v.id)}/start.sh`)!.async('string');
      expect(sh, v.id).toContain(v.jar.sha1);
      expect(sh, v.id).toContain(`JAVA_MIN='${v.javaMajor}'`);
    }
  });

  it('zipBundle works on its own for the CLI test mode (no eula.txt)', async () => {
    const files = buildBundleFiles(cfg({ eulaAccepted: false }), entry('26.3'), profile('26.3'));
    const zip = await JSZip.loadAsync(await (await zipBundle('26.3', files)).arrayBuffer());
    expect(Object.keys(zip.files).some((n) => n.endsWith('eula.txt'))).toBe(false);
  });
});
