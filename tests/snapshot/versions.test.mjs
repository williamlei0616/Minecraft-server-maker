import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FLOOR_ID,
  buildVersionsFile,
  isAllowedHttpsUrl,
  selectVersions,
  toEntry,
} from '../../scripts/lib/versions.mjs';

const fx = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const manifest = fx('manifest.json');

describe('selectVersions', () => {
  const picked = selectVersions(manifest);
  const ids = picked.map((r) => r.id);

  it('uses 1.18.2 as the floor', () => {
    expect(FLOOR_ID).toBe('1.18.2');
  });

  it('keeps the latest release and the floor release', () => {
    expect(ids).toContain(manifest.latest.release);
    expect(ids).toContain('1.18.2');
    expect(ids).toContain('1.21.4');
  });

  it('drops releases below the floor', () => {
    expect(ids).not.toContain('1.18.1');
    expect(ids).not.toContain('1.18');
    expect(ids).not.toContain('1.17.1');
  });

  it('keeps snapshots newer than the latest release only', () => {
    expect(ids).toContain(manifest.latest.snapshot);
    expect(ids).toContain('26.4-snapshot-1');
    // rc / pre-release / older snapshots sit after the latest release in the manifest
    expect(ids).not.toContain('26.3-rc-3');
    expect(ids).not.toContain('26.3-pre-1');
    expect(ids).not.toContain('26.3-snapshot-10');
  });

  it('never keeps old_beta or old_alpha', () => {
    expect(picked.every((r) => r.type === 'release' || r.type === 'snapshot')).toBe(true);
    expect(ids).not.toContain('b1.8.1');
    expect(ids).not.toContain('a1.2.6');
  });

  it('preserves the manifest order (newest first)', () => {
    const order = manifest.versions.map((r) => r.id).filter((id) => ids.includes(id));
    expect(ids).toEqual(order);
  });

  it('throws when the floor or latest release is missing (fail safe)', () => {
    expect(() => selectVersions(manifest, '9.9.9')).toThrow(/floor/);
    expect(() =>
      selectVersions({ ...manifest, latest: { ...manifest.latest, release: '0.0' } }),
    ).toThrow(/latest release/);
  });
});

describe('toEntry', () => {
  const row = (id) => manifest.versions.find((r) => r.id === id);

  it('maps a modern release to the documented shape', () => {
    const entry = toEntry(row('1.21.4'), fx('version-1.21.4.json'));
    expect(entry).toEqual({
      id: '1.21.4',
      type: 'release',
      releaseTime: row('1.21.4').releaseTime,
      jar: {
        url: 'https://piston-data.mojang.com/v1/objects/4707d00eb834b446575d89a61a11b5d548d8c001/server.jar',
        sha1: '4707d00eb834b446575d89a61a11b5d548d8c001',
        size: 56880250,
      },
      javaMajor: 21,
    });
  });

  it('maps the latest release and a snapshot', () => {
    const latest = toEntry(
      row(manifest.latest.release),
      fx(`version-${manifest.latest.release}.json`),
    );
    expect(latest?.type).toBe('release');
    expect(latest?.javaMajor).toBeGreaterThanOrEqual(17);
    const snap = toEntry(
      row(manifest.latest.snapshot),
      fx(`version-${manifest.latest.snapshot}.json`),
    );
    expect(snap?.type).toBe('snapshot');
  });

  it('floor and the version below it both have a server jar entry (data sanity)', () => {
    expect(toEntry(row('1.18.2'), fx('version-1.18.2.json'))?.javaMajor).toBe(17);
    expect(toEntry(row('1.18.1'), fx('version-1.18.1.json'))?.javaMajor).toBe(17);
  });

  it('returns null when there is no server download', () => {
    const j = fx('version-1.21.4.json');
    expect(toEntry(row('1.21.4'), { ...j, downloads: {} })).toBeNull();
  });

  it('returns null when the version JSON id does not match the row', () => {
    expect(toEntry(row('1.21.4'), fx('version-1.18.2.json'))).toBeNull();
  });

  it('returns null for a bad sha1, size, java version, or jar host', () => {
    const j = fx('version-1.21.4.json');
    const withServer = (patch) => ({
      ...j,
      downloads: { server: { ...j.downloads.server, ...patch } },
    });
    expect(toEntry(row('1.21.4'), withServer({ sha1: 'xyz' }))).toBeNull();
    expect(toEntry(row('1.21.4'), withServer({ size: 0 }))).toBeNull();
    expect(
      toEntry(row('1.21.4'), withServer({ url: 'http://piston-data.mojang.com/x/server.jar' })),
    ).toBeNull();
    expect(
      toEntry(row('1.21.4'), withServer({ url: 'https://evil.example.com/server.jar' })),
    ).toBeNull();
    expect(toEntry(row('1.21.4'), { ...j, javaVersion: undefined })).toBeNull();
  });

  it('isAllowedHttpsUrl rejects look-alike hosts and junk', () => {
    const hosts = new Set(['piston-data.mojang.com']);
    expect(isAllowedHttpsUrl('https://piston-data.mojang.com.evil.com/x', hosts)).toBe(false);
    expect(isAllowedHttpsUrl('https://evil.com/piston-data.mojang.com', hosts)).toBe(false);
    expect(isAllowedHttpsUrl('not a url', hosts)).toBe(false);
  });
});

describe('buildVersionsFile', () => {
  // Only five version JSONs are recorded as fixtures.
  const entries = [manifest.latest.snapshot, manifest.latest.release, '1.21.4', '1.18.2'].map(
    (id) =>
      toEntry(
        manifest.versions.find((r) => r.id === id),
        fx(`version-${id}.json`),
      ),
  );

  it('assembles schema 1 with latest and entries', () => {
    const file = buildVersionsFile(manifest, entries, '2026-11-10T06:00:00.000Z');
    expect(file.schema).toBe(1);
    expect(file.latest).toEqual(manifest.latest);
    expect(file.generatedAt).toBe('2026-11-10T06:00:00.000Z');
    expect(file.versions).toBe(entries);
  });

  it('throws on empty output or when the latest release is missing', () => {
    expect(() => buildVersionsFile(manifest, [], 'x')).toThrow(/no versions/);
    expect(() => buildVersionsFile(manifest, [{ id: '1.21.4' }], 'x')).toThrow(/latest release/);
  });
});
