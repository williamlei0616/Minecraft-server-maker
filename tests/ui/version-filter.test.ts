import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { VersionsFile } from '@/core';
import { filterVersions, pickFromText, type VersionOption } from '@/ui/versionFilter';

const file = JSON.parse(
  readFileSync(new URL('../../public/versions.json', import.meta.url), 'utf8'),
) as VersionsFile;
const all: VersionOption[] = file.versions.map((v) => ({
  id: v.id,
  label: v.id,
  newest: v.id === file.latest.release,
  snapshot: v.type === 'snapshot',
}));
const releases = all.filter((o) => !o.snapshot);
const ids = (list: VersionOption[]) => list.map((o) => o.id);

describe('filterVersions', () => {
  it('shows everything, in the given order, for an empty search', () => {
    expect(ids(filterVersions(releases, ''))).toEqual(ids(releases));
    expect(ids(filterVersions(releases, '   '))).toEqual(ids(releases));
  });

  it('puts an exact id first, then ids that start with the text, then ids that contain it', () => {
    expect(ids(filterVersions(releases, '1.21'))[0]).toBe('1.21');
    const r = ids(filterVersions(releases, '1.21'));
    // the exact id first, then its patch versions in list order (newest first)
    expect(r.slice(0, 12)).toEqual([
      '1.21',
      '1.21.11',
      '1.21.10',
      '1.21.9',
      '1.21.8',
      '1.21.7',
      '1.21.6',
      '1.21.5',
      '1.21.4',
      '1.21.3',
      '1.21.2',
      '1.21.1',
    ]);
    expect(ids(filterVersions(releases, '26')).slice(0, 2)).toEqual(['26.3', '26.2']);
  });

  it('matches inside an id too, after the ones that start with the text', () => {
    const r = ids(filterVersions(releases, '.4'));
    expect(r).toEqual(expect.arrayContaining(['1.21.4', '1.20.4', '1.19.4']));
    expect(r).not.toContain('26.3');
  });

  it('understands "newest" and "latest"', () => {
    expect(ids(filterVersions(all, 'newest'))).toEqual([file.latest.release]);
    expect(ids(filterVersions(all, 'LATEST'))).toEqual([file.latest.release]);
  });

  it('is case-insensitive and finds test versions by name', () => {
    const r = ids(filterVersions(all, 'SNAPSHOT'));
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((id) => id.includes('snapshot'))).toBe(true);
  });

  it('returns nothing, never throws, for text that matches no version', () => {
    expect(filterVersions(releases, 'zzz')).toEqual([]);
    expect(filterVersions(releases, '(((')).toEqual([]);
  });

  it('never treats versions as numbers: 26.3 is newer than 1.21.4 only because of list order', () => {
    expect(ids(filterVersions(releases, '26.3'))).toEqual(['26.3']);
    expect(ids(releases)[0]).toBe(file.latest.release);
  });
});

describe('pickFromText', () => {
  it('picks an exact id, ignoring case and spaces', () => {
    expect(pickFromText(releases, ' 1.21.4 ')?.id).toBe('1.21.4');
    expect(pickFromText(all, '26.4-SNAPSHOT-7')?.id).toBe('26.4-snapshot-7');
  });

  it('picks the only match, but refuses when it is ambiguous', () => {
    expect(pickFromText(all, 'snapshot-7')?.id).toBe('26.4-snapshot-7');
    expect(pickFromText(releases, '1.21')?.id).toBe('1.21'); // exact id wins over its longer neighbours
    expect(pickFromText(releases, '1.2')).toBeNull();
  });

  it('returns null for empty or unknown text', () => {
    expect(pickFromText(releases, '')).toBeNull();
    expect(pickFromText(releases, 'abc')).toBeNull();
  });
});
