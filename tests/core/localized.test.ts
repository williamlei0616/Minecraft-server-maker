import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildBundle, buildBundleFiles } from '../../src/core/bundle';
import { defaultConfig } from '../../src/core/config';
import {
  ScriptInputError,
  renderStartBat,
  renderStartSh,
  type ScriptInput,
} from '../../src/core/scripts';
import type {
  BundleLocale,
  ServerConfig,
  VersionProfile,
  VersionsFile,
} from '../../src/core/types';

const PUBLIC = new URL('../../public/', import.meta.url);
const versions = JSON.parse(readFileSync(new URL('versions.json', PUBLIC), 'utf8')) as VersionsFile;
const profile = JSON.parse(
  readFileSync(new URL('profiles/26.3.json', PUBLIC), 'utf8'),
) as VersionProfile;
const entry = versions.versions.find((v) => v.id === '26.3')!;
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

const isAscii = (text: string): boolean => [...text].every((ch) => ch.charCodeAt(0) < 128);
const BOM = '﻿';
const HELP = 'https://example.github.io/Minecraft-server-maker/zh-hant/help/';

function readme(locale?: BundleLocale, helpUrl?: string, over: Partial<ServerConfig> = {}): string {
  const options = { ...(locale ? { locale } : {}), ...(helpUrl ? { helpUrl } : {}) };
  return buildBundleFiles(cfg(over), entry, profile, options).find((f) => f.path === 'README.txt')!
    .content;
}

const scriptInput = (over: Partial<ScriptInput> = {}): ScriptInput => ({
  versionId: entry.id,
  jarUrl: entry.jar.url,
  jarSha1: entry.jar.sha1,
  jarMegabytes: 59,
  javaMajor: 25,
  jvmArgs: ['-Xms1G', '-Xmx4G'],
  jarArgs: ['--nogui'],
  opUsername: '',
  ...over,
});

describe('README language', () => {
  it('English is plain ASCII with Windows line endings and no byte order mark', () => {
    const r = readme('en');
    expect(isAscii(r)).toBe(true);
    expect(r.startsWith(BOM)).toBe(false);
    expect(r.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(r).toContain('\r\n');
  });

  it('with no language given the README is English', () => {
    expect(readme()).toBe(readme('en'));
  });

  it('Traditional Chinese starts with a byte order mark, uses CRLF, and says the same things', () => {
    const r = readme('zh-hant', undefined, { opUsername: 'Steve_01', port: 25570 });
    expect(r.startsWith(BOM)).toBe(true);
    expect(r.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const must of [
      '如何啟動',
      'start.bat',
      'sh start.sh',
      'localhost',
      'Java 25',
      '25570',
      'op Steve_01',
      'https://aka.ms/MinecraftEULA',
      'eula=true',
      'Mojang',
    ]) {
      expect(r, must).toContain(must);
    }
  });

  it('the Chinese README never claims an EULA acceptance that did not happen', () => {
    const r = readme('zh-hant', undefined, { eulaAccepted: false });
    expect(r).not.toContain('你已在 Minecraft Server Maker 頁面同意');
    expect(r).toContain('eula=false 改成 eula=true');
  });

  it('the operator section appears in Chinese only when a username was given', () => {
    expect(readme('zh-hant')).not.toContain('指令權限');
    expect(readme('zh-hant', undefined, { opUsername: 'Steve_01' })).toContain('指令權限');
  });

  it('survives the zip as UTF-8 with the byte order mark', async () => {
    const blob = await buildBundle(cfg(), versions.versions, {
      fetch: fileFetch,
      locale: 'zh-hant',
    });
    const z = await JSZip.loadAsync(await blob.arrayBuffer());
    const bytes = await z.file('minecraft-server-26.3/README.txt')!.async('uint8array');
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain('如何啟動');
  });

  it('the scripts stay plain ASCII English in every language', () => {
    for (const locale of ['en', 'zh-hant'] as const) {
      const files = buildBundleFiles(cfg({ opUsername: 'Steve_01' }), entry, profile, {
        locale,
        helpUrl: HELP,
      });
      for (const name of ['start.bat', 'start.sh']) {
        const content = files.find((f) => f.path === name)!.content;
        expect(isAscii(content), `${name} (${locale})`).toBe(true);
      }
    }
  });
});

describe('help address in the scripts', () => {
  it('goes into the README and into the Java and download messages of both scripts', () => {
    const files = buildBundleFiles(cfg(), entry, profile, { locale: 'zh-hant', helpUrl: HELP });
    const get = (n: string) => files.find((f) => f.path === n)!.content;
    expect(get('README.txt')).toContain(HELP);
    expect(get('start.bat')).toContain(`echo More help: ${HELP}#java`);
    expect(get('start.bat')).toContain(`echo More help: ${HELP}#download`);
    expect(get('start.sh')).toContain(`"More help: ${HELP}#java"`);
    expect(get('start.sh')).toContain(`"More help: ${HELP}#download"`);
  });

  it('without a help address the scripts are unchanged', () => {
    expect(renderStartBat(scriptInput())).not.toContain('More help');
    expect(renderStartSh(scriptInput())).not.toContain('More help');
    expect(readme('en')).not.toContain('MORE HELP');
  });

  it('refuses an address that could do anything but be printed', () => {
    const bad = [
      'javascript:alert(1)',
      'https://x.com/a b',
      'https://x.com/"; rm -rf /',
      'https://x.com/%41',
      'https://x.com/a#frag',
      'ftp://x.com/',
      'https://x.com/&calc',
      'https://x.com/`id`',
      'https://' + 'a'.repeat(300),
    ];
    for (const helpUrl of bad) {
      expect(() => renderStartBat(scriptInput({ helpUrl })), helpUrl.slice(0, 30)).toThrow(
        ScriptInputError,
      );
      expect(() => renderStartSh(scriptInput({ helpUrl })), helpUrl.slice(0, 30)).toThrow(
        ScriptInputError,
      );
    }
  });

  it('accepts the addresses the site really has (Pages subpath, custom domain, local dev)', () => {
    for (const helpUrl of [
      'https://user.github.io/Minecraft-server-maker/help/',
      'https://example.com/zh-hant/help/',
      'http://localhost:3100/help/',
    ]) {
      expect(() => renderStartBat(scriptInput({ helpUrl }))).not.toThrow();
      expect(() => renderStartSh(scriptInput({ helpUrl }))).not.toThrow();
    }
  });
});
