// @vitest-environment node
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { defaultConfig, validate, type VersionsFile } from '@/core';
import { MESSAGES } from '@/i18n';
import { QUESTIONS, answerText, defaultAnswers, sanitizeAnswers, toConfig } from '@/ui/questions';
import { findWorlds, readMapFromFolder, readMapFromZip, ZIP_MAX_BYTES } from '@/ui/readMap';
import { decodeShare, encodeShare } from '@/ui/share';
import { loadDraft, saveDraft } from '@/ui/storage';

const PUBLIC = new URL('../../public/', import.meta.url);
const versions = JSON.parse(readFileSync(new URL('versions.json', PUBLIC), 'utf8')) as VersionsFile;
const level = (id: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../fixtures/maps/level-${id}.dat`, import.meta.url)));

/** A File with a folder path, the way a directory picker reports it. */
const picked = (path: string, bytes: Uint8Array | string = 'x'): File => {
  const f = new File([bytes as BlobPart], path.split('/').pop() ?? path);
  Object.defineProperty(f, 'webkitRelativePath', { value: path });
  return f;
};

describe('findWorlds', () => {
  it('finds level.dat at any depth, shallowest first, and ignores copies and backups', () => {
    const found = findWorlds([
      'Saves/Deep/World/level.dat',
      'World/level.dat',
      'World/level.dat_old',
      'World/region/r.0.0.mca',
      '__MACOSX/World/level.dat',
      'World/DIM-1/data/raids.dat',
      'Other/level.dat',
    ]);
    expect(found.map((w) => w.path)).toEqual([
      'Other/level.dat',
      'World/level.dat',
      'Saves/Deep/World/level.dat',
    ]);
    expect(found[0]).toMatchObject({ folder: 'Other', depth: 2 });
  });

  it('level.dat at the very top has no folder', () => {
    expect(findWorlds(['level.dat', 'region/r.0.0.mca'])).toEqual([
      { path: 'level.dat', folder: null, depth: 1 },
    ]);
  });

  it('accepts Windows separators and ignores a file that merely ends in level.dat', () => {
    expect(findWorlds(['World\\level.dat']).map((w) => w.folder)).toEqual(['World']);
    expect(findWorlds(['World/old_level.dat', 'World/notlevel.dat'])).toEqual([]);
  });
});

describe('reading a picked folder', () => {
  it('the world folder itself', async () => {
    const r = await readMapFromFolder([
      picked('My World/level.dat', level('1.21.4')),
      picked('My World/region/r.0.0.mca'),
    ]);
    expect(r).toMatchObject({
      ok: true,
      info: {
        folderName: 'My World',
        levelName: 'Sample World',
        dataVersion: 4189,
        versionName: '1.21.4',
        source: 'folder',
        insidePath: null,
        zipRoot: false,
        others: 0,
      },
    });
  });

  it('a parent folder: names the real world folder and says where it was', async () => {
    const r = await readMapFromFolder([picked('Saves/Old/level.dat', level('1.18.2'))]);
    expect(r).toMatchObject({
      ok: true,
      info: { folderName: 'Old', insidePath: 'Saves/Old', dataVersion: 2975 },
    });
  });

  it('more than one world: the shallowest, and the count', async () => {
    const r = await readMapFromFolder([
      picked('Saves/A/level.dat', level('1.18.2')),
      picked('Saves/B/level.dat', level('1.21.4')),
      picked('Saves/B/Nested/level.dat', level('1.21.4')),
    ]);
    expect(r).toMatchObject({ ok: true, info: { folderName: 'A', others: 2 } });
  });

  it('says what is wrong, in a way the page can word', async () => {
    const reason = async (files: File[]) => {
      const r = await readMapFromFolder(files);
      return r.ok ? 'ok' : r.reason;
    };
    expect(await reason([picked('W/region/r.0.0.mca')])).toBe('noLevelDat');
    expect(await reason([picked('W/level.dat', 'not gzip at all')])).toBe('notJava');
    expect(await reason([picked('W/level.dat', level('1.21.4').slice(0, 40))])).toBe('damaged');
    expect(await reason([picked('W. /level.dat', level('1.21.4'))])).toBe('badName');
    expect(await reason([picked('libraries/level.dat', level('1.21.4'))])).toBe('badName');
    expect(await reason([])).toBe('noLevelDat');
  });
});

describe('reading a zip', () => {
  const makeZip = async (files: Record<string, Uint8Array | string>, name = 'My Map.zip') => {
    const zip = new JSZip();
    for (const [path, data] of Object.entries(files)) zip.file(path, data);
    return new File([(await zip.generateAsync({ type: 'uint8array' })) as BlobPart], name);
  };

  it('a zip with the world folder at the top', async () => {
    const r = await readMapFromZip(await makeZip({ 'World/level.dat': level('1.21.4') }));
    expect(r).toMatchObject({
      ok: true,
      info: { folderName: 'World', source: 'zip', insidePath: null, zipRoot: false },
    });
  });

  it('a zip with one extra folder around the world', async () => {
    const r = await readMapFromZip(
      await makeZip({
        'Outer/World/level.dat': level('1.21.4'),
        '__MACOSX/Outer/World/level.dat': 'junk',
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      info: { folderName: 'World', insidePath: 'Outer/World', others: 0 },
    });
  });

  it('a zip with the map files at the top is named after the zip', async () => {
    const r = await readMapFromZip(await makeZip({ 'level.dat': level('1.18.2') }, 'Cool Map.zip'));
    expect(r).toMatchObject({ ok: true, info: { folderName: 'Cool Map', zipRoot: true } });
  });

  it('refuses things that are not a map', async () => {
    const reason = async (f: File) => {
      const r = await readMapFromZip(f);
      return r.ok ? 'ok' : r.reason;
    };
    expect(await reason(new File(['not a zip'], 'a.zip'))).toBe('notZip');
    expect(await reason(await makeZip({ 'readme.txt': 'hi' }))).toBe('noLevelDat');
    expect(await reason(await makeZip({ 'W/level.dat': 'plain text' }))).toBe('notJava');
  });

  it('refuses a zip that is too big to read, without reading it', async () => {
    const huge = new File([], 'big.zip');
    Object.defineProperty(huge, 'size', { value: ZIP_MAX_BYTES + 1 });
    expect(await readMapFromZip(huge)).toMatchObject({ ok: false, reason: 'zipTooBig' });
  });
});

describe('the map question', () => {
  const answers = (over: Record<string, string> = {}) => ({
    ...defaultAnswers(versions.latest.release),
    ...over,
  });

  it('is the last question of the Gameplay step', () => {
    const gameplay = QUESTIONS.filter((q) => q.step === 'gameplay');
    expect(gameplay[gameplay.length - 1]).toMatchObject({ id: 'map', kind: 'map' });
  });

  it('no map by default; a picked map becomes the config and validates', () => {
    expect(toConfig(answers(), true).map).toBeNull();
    const c = toConfig(answers({ map: 'My World' }), true);
    expect(c.map).toEqual({ folderName: 'My World' });
    expect(validate(c, versions.versions)).toEqual({ ok: true });
    expect(
      validate({ ...defaultConfig(versions), map: { folderName: '../x' } }, versions.versions).ok,
    ).toBe(false);
  });

  it('a map never comes from a link or saved answers, and never goes into either', async () => {
    expect(sanitizeAnswers({ map: 'Evil', motd: 'x' })).toEqual({ motd: 'x' });
    const token = await encodeShare(answers({ map: 'My World' }), versions.latest.release);
    expect((await decodeShare(token))?.map).toBeUndefined();
    const store = new Map<string, string>();
    saveDraft(
      { answers: answers({ map: 'My World' }), showSnapshots: false },
      {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => void store.set(k, v),
        removeItem: () => {},
      },
    );
    expect([...store.values()].join('')).not.toContain('My World');
    expect(
      loadDraft({ getItem: (k) => store.get(k) ?? null, setItem: () => {}, removeItem: () => {} })
        ?.answers.map,
    ).toBeUndefined();
  });

  it('the review says the folder name or None, in both languages', () => {
    const q = QUESTIONS.find((x) => x.id === 'map')!;
    expect(answerText(q, 'My World', MESSAGES.en)).toBe('My World');
    expect(answerText(q, '', MESSAGES.en)).toBe('None');
    expect(answerText(q, '', MESSAGES['zh-hant'])).toBe('無');
  });
});
