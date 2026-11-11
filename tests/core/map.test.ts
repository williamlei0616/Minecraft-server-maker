import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { defaultConfig, validate } from '../../src/core/config';
import { checkExtraProperties, lockedKeys, parseEditorText } from '../../src/core/extras';
import {
  MapError,
  checkMapCompat,
  gunzip,
  isSafeMapFolderName,
  parseNbt,
  readLevelDat,
} from '../../src/core/map';
import { planProperties, renderServerProperties } from '../../src/core/properties';
import { renderReadme } from '../../src/core/readme';
import type { ServerConfig, VersionProfile, VersionsFile } from '../../src/core/types';

const PUBLIC = new URL('../../public/', import.meta.url);
const profile = (id: string): VersionProfile =>
  JSON.parse(readFileSync(new URL(`profiles/${id}.json`, PUBLIC), 'utf8'));
const versions = JSON.parse(readFileSync(new URL('versions.json', PUBLIC), 'utf8')) as VersionsFile;
const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../fixtures/maps/${name}`, import.meta.url)));
const cfg = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  ...defaultConfig(versions),
  versionId: '26.3',
  eulaAccepted: true,
  ...over,
});

/* ---- a tiny NBT writer, only for building test files ---- */
const be = (n: number, bytes: number): number[] =>
  Array.from({ length: bytes }, (_, i) => (n >> (8 * (bytes - 1 - i))) & 0xff);
const name = (s: string): number[] => {
  const b = [...new TextEncoder().encode(s)];
  return [...be(b.length, 2), ...b];
};
const tagString = (key: string, v: string): number[] => [8, ...name(key), ...name(v)];
const tagInt = (key: string, v: number): number[] => [3, ...name(key), ...be(v, 4)];
const tagCompound = (key: string, children: number[]): number[] => [
  10,
  ...name(key),
  ...children,
  0,
];
const nbt = (children: number[]): Uint8Array => new Uint8Array([10, ...name(''), ...children, 0]);
const levelDat = (inner: number[]): Uint8Array =>
  new Uint8Array(gzipSync(nbt(tagCompound('Data', inner))));

describe('real level.dat files written by real servers', () => {
  it('1.18.2', async () => {
    const info = await readLevelDat(fixture('level-1.18.2.dat'));
    expect(info).toEqual({ levelName: 'Old Sample', dataVersion: 2975, versionName: '1.18.2' });
  });

  it('1.21.4', async () => {
    const info = await readLevelDat(fixture('level-1.21.4.dat'));
    expect(info).toEqual({ levelName: 'Sample World', dataVersion: 4189, versionName: '1.21.4' });
  });

  it('their DataVersion is exactly the profile world version of the server that wrote them', async () => {
    expect((await readLevelDat(fixture('level-1.18.2.dat'))).dataVersion).toBe(
      profile('1.18.2').dataVersion,
    );
    expect((await readLevelDat(fixture('level-1.21.4.dat'))).dataVersion).toBe(
      profile('1.21.4').dataVersion,
    );
  });
});

describe('readLevelDat on hand-built files', () => {
  it('reads the name, data version and version name', async () => {
    const bytes = levelDat([
      ...tagString('LevelName', 'Mein Welt 世界'),
      ...tagInt('DataVersion', 3465),
      ...tagCompound('Version', [...tagString('Name', '1.20.1'), ...tagInt('Id', 3465)]),
    ]);
    expect(await readLevelDat(bytes)).toEqual({
      levelName: 'Mein Welt 世界',
      dataVersion: 3465,
      versionName: '1.20.1',
    });
  });

  it('a world from before 1.9 has no DataVersion', async () => {
    const info = await readLevelDat(levelDat(tagString('LevelName', 'Ancient')));
    expect(info).toEqual({ levelName: 'Ancient', dataVersion: null, versionName: null });
  });

  it('skips arrays and unknown tags without being confused', async () => {
    const arrays = [
      7,
      ...name('bytes'),
      ...be(3, 4),
      1,
      2,
      3, // byte array
      11,
      ...name('ints'),
      ...be(2, 4),
      ...be(1, 4),
      ...be(2, 4), // int array
      12,
      ...name('longs'),
      ...be(1, 4),
      ...be(0, 4),
      ...be(7, 4), // long array
      9,
      ...name('list'),
      8,
      ...be(2, 4),
      ...name('a'),
      ...name('b'), // list of strings
    ];
    const info = await readLevelDat(levelDat([...arrays, ...tagInt('DataVersion', 5)]));
    expect(info.dataVersion).toBe(5);
  });

  it('refuses things that are not a Java world file', async () => {
    const code = async (b: Uint8Array) => {
      try {
        await readLevelDat(b);
        return 'ok';
      } catch (e) {
        return e instanceof MapError ? e.code : 'other';
      }
    };
    expect(await code(new Uint8Array())).toBe('notGzip');
    expect(await code(new TextEncoder().encode('{"hello": 1}'))).toBe('notGzip');
    // Bedrock level.dat: plain little-endian data with an 8 byte header
    expect(await code(new Uint8Array([8, 0, 0, 0, 90, 0, 0, 0, 10, 0, 0, 0]))).toBe('notGzip');
    const good = levelDat(tagString('LevelName', 'x'));
    expect(await code(good.slice(0, good.length - 6))).toBe('corrupt');
    expect(await code(new Uint8Array(gzipSync(new Uint8Array([1, 2, 3, 4]))))).toBe('corrupt');
    expect(await code(new Uint8Array(gzipSync(nbt([]))))).toBe('noData');
    expect(await code(new Uint8Array(gzipSync(nbt(tagCompound('Other', [])))))).toBe('noData');
  });

  it('stops a size bomb', async () => {
    const bomb = new Uint8Array(gzipSync(new Uint8Array(20 * 1024 * 1024)));
    expect(bomb.length).toBeLessThan(100_000);
    await expect(gunzip(bomb)).rejects.toMatchObject({ code: 'tooBig' });
  });

  it('stops absurd nesting and absurd lists', () => {
    let deep: number[] = [];
    for (let i = 0; i < 100; i++) deep = [10, ...name('d'), ...deep, 0];
    expect(() => parseNbt(nbt(deep))).toThrow(MapError);
    const hugeList = [9, ...name('l'), 10, ...be(0x7fffffff, 4)];
    expect(() => parseNbt(nbt(hugeList))).toThrow(MapError);
    const hugeArray = [7, ...name('a'), ...be(0x7fffffff, 4)];
    expect(() => parseNbt(nbt(hugeArray))).toThrow(MapError);
    expect(() => parseNbt(new Uint8Array([10, 0, 0, 99, 0, 0, 0]))).toThrow(MapError); // bad tag
  });

  it('never lets a key like __proto__ reach a prototype', () => {
    const root = parseNbt(nbt(tagInt('__proto__', 1)));
    expect(root.get('__proto__')).toBe(1);
    expect(({} as Record<string, unknown>).__proto__).toBe(Object.prototype);
  });
});

describe('checkMapCompat', () => {
  const p = (dataVersion?: number): Pick<VersionProfile, 'dataVersion'> =>
    dataVersion === undefined ? {} : { dataVersion };
  it('a newer map cannot be opened, an older one is upgraded, the same is fine', () => {
    expect(checkMapCompat(5023, p(5023))).toBe('ok');
    expect(checkMapCompat(5024, p(5023))).toBe('newer');
    expect(checkMapCompat(4189, p(5023))).toBe('older');
    expect(checkMapCompat(null, p(5023))).toBe('older');
    expect(checkMapCompat(5000, p())).toBe('unknown');
  });

  it('holds across the real versions', async () => {
    const old = (await readLevelDat(fixture('level-1.21.4.dat'))).dataVersion;
    expect(checkMapCompat(old, profile('1.21.4'))).toBe('ok');
    expect(checkMapCompat(old, profile('1.21.5'))).toBe('older');
    expect(checkMapCompat(old, profile('1.21.3'))).toBe('newer');
    expect(checkMapCompat(old, profile('1.18.2'))).toBe('newer');
    expect(checkMapCompat(old, profile('26.3'))).toBe('older');
  });
});

describe('isSafeMapFolderName', () => {
  it('accepts ordinary and international names', () => {
    for (const n of [
      'world',
      'My Survival World',
      'Mein Welt',
      '我的世界',
      'a',
      "O'Brien's map",
      'map-1.2_final',
    ]) {
      expect(isSafeMapFolderName(n), n).toBe(true);
    }
  });

  it('refuses anything that is not a safe folder name', () => {
    const bad = [
      '',
      ' ',
      '.',
      '..',
      '../evil',
      'a/b',
      'a\\b',
      'C:',
      'a:b',
      'a*b',
      'a?b',
      'a"b',
      'a<b',
      'a>b',
      'a|b',
      'tab\there',
      'new\nline',
      'nul\u0000l',
      'trailing ',
      'trailing.',
      ' leading',
      'CON',
      'con.txt',
      'Nul',
      'COM1',
      'lpt9',
      'libraries',
      'Logs',
      'versions',
      'x'.repeat(65),
    ];
    for (const n of bad) expect(isSafeMapFolderName(n), JSON.stringify(n)).toBe(false);
    expect(isSafeMapFolderName(undefined as unknown as string)).toBe(false);
    expect(isSafeMapFolderName(5 as unknown as string)).toBe(false);
  });
});

describe('the map in the config and the files', () => {
  it('validates the folder name', () => {
    const detail = (map: ServerConfig['map']) => {
      const r = validate(cfg({ map }), versions.versions);
      return r.ok ? undefined : r.details.map;
    };
    expect(detail(null)).toBeUndefined();
    expect(detail({ folderName: 'My World' })).toBeUndefined();
    expect(detail({ folderName: '../x' })).toEqual({ code: 'mapName', value: '../x' });
    expect(detail({ folderName: '' })?.code).toBe('mapName');
    expect(detail({} as unknown as ServerConfig['map'])?.code).toBe('mapName');
  });

  it('level-name follows the map, on every version, and wins over a typed edit', () => {
    for (const id of ['1.18.2', '1.21.4', '26.3']) {
      const plan = planProperties(
        profile(id),
        cfg({
          versionId: id,
          map: { folderName: 'My World' },
          extraProperties: { 'level-name': 'other' },
        }),
      );
      expect(plan.entries.find((e) => e.key === 'level-name')?.value, id).toBe('My World');
    }
    const without = planProperties(profile('26.3'), cfg());
    expect(without.entries.find((e) => e.key === 'level-name')?.value).toBe('world');
  });

  it('a hostile-looking but legal name stays one value', () => {
    const text = renderServerProperties(
      planProperties(profile('26.3'), cfg({ map: { folderName: 'a=b #c!' } })),
    );
    expect(text).toContain('level-name=a\\=b \\#c\\!\n');
  });

  it('the editor may not change level-name while a map is attached', () => {
    const p = profile('26.3');
    const config = cfg({ map: { folderName: 'My World' } });
    const locked = lockedKeys(config);
    expect(locked).toEqual(['level-name']);
    expect(lockedKeys(cfg())).toEqual([]);
    expect(
      checkExtraProperties(p, { 'level-name': 'other' }, locked).map((i) => `${i.code}:${i.key}`),
    ).toEqual(['locked:level-name']);
    expect(checkExtraProperties(p, { 'level-name': 'other' })).toEqual([]);

    const base = planProperties(p, config).entries;
    const text = renderServerProperties(planProperties(p, config)).replace(
      'level-name=My World',
      'level-name=other',
    );
    const r = parseEditorText(text, p, base, locked);
    expect(r.issues).toEqual([expect.objectContaining({ code: 'locked', key: 'level-name' })]);
    // untouched, the line is no problem
    const same = parseEditorText(
      renderServerProperties(planProperties(p, config)),
      p,
      base,
      locked,
    );
    expect(same.issues).toEqual([]);
  });

  it('the README names the folder to copy, in both languages', () => {
    const input = {
      versionId: '26.3',
      javaMajor: 25,
      jarMegabytes: 59,
      port: 25565,
      opUsername: '',
      gui: true,
      eulaAccepted: true,
      mapFolder: 'My World',
    };
    expect(renderReadme(input, 'en')).toContain('"My World"');
    expect(renderReadme(input, 'zh-hant')).toContain('「My World」');
    expect(renderReadme({ ...input, mapFolder: undefined }, 'en')).not.toContain('YOUR MAP');
  });

  it('an English README with a Chinese map name gets a byte order mark, a plain one does not', () => {
    const input = {
      versionId: '26.3',
      javaMajor: 25,
      jarMegabytes: 59,
      port: 25565,
      opUsername: '',
      gui: true,
      eulaAccepted: true,
    };
    expect(renderReadme(input, 'en').charCodeAt(0)).not.toBe(0xfeff);
    expect(renderReadme({ ...input, mapFolder: '我的世界' }, 'en').charCodeAt(0)).toBe(0xfeff);
  });
});
