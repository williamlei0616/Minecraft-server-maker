import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  MANIFEST_URL,
  buildVersions,
  fetchJsonWithRetry,
  sameContent,
  updateVersionsFile,
} from '../../scripts/build-versions.mjs';

const fx = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const manifest = fx('manifest.json');
const rowByUrl = new Map(manifest.versions.map((r) => [r.url, r]));

/** Version JSON for a row: the recorded fixture if we have one, otherwise a synthetic one. */
function versionJsonFor(row) {
  try {
    return fx(`version-${row.id}.json`);
  } catch {
    const sha1 = (row.id.length.toString(16).padStart(2, '0') + 'ab').repeat(20).slice(0, 40);
    return {
      id: row.id,
      type: row.type,
      downloads: {
        server: {
          sha1,
          size: 1234,
          url: `https://piston-data.mojang.com/v1/objects/${sha1}/server.jar`,
        },
      },
      javaVersion: { majorVersion: 21 },
    };
  }
}

function stub({ failUrl, overrides = {} } = {}) {
  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    if (url === failUrl) throw new Error('HTTP 500');
    if (url === MANIFEST_URL) return overrides.manifest ?? manifest;
    return overrides[url] ?? versionJsonFor(rowByUrl.get(url));
  };
  return { fetchJson, calls };
}

describe('buildVersions', () => {
  it('builds a file with the latest release first among releases', async () => {
    const { fetchJson } = stub();
    const { file, skipped } = await buildVersions({ fetchJson, now: '2026-01-01T00:00:00Z' });
    const ids = file.versions.map((v) => v.id);
    expect(file.schema).toBe(1);
    expect(file.latest).toEqual(manifest.latest);
    expect(ids).toContain('26.3');
    expect(ids).toContain('1.18.2');
    expect(ids).not.toContain('1.18.1');
    expect(skipped).toEqual([]);
  });

  it('reuses known release entries without any network call, but re-fetches snapshots', async () => {
    const sentinel = {
      id: '1.21.4',
      type: 'release',
      releaseTime: 'x',
      jar: {
        url: 'https://piston-data.mojang.com/v1/objects/aa/server.jar',
        sha1: 'a'.repeat(40),
        size: 5,
      },
      javaMajor: 99,
    };
    const snap = { ...sentinel, id: '26.4-snapshot-7', type: 'snapshot' };
    const existing = {
      schema: 1,
      generatedAt: 'old',
      latest: manifest.latest,
      versions: [sentinel, snap],
    };
    const { fetchJson, calls } = stub();
    const { file, reused } = await buildVersions({ fetchJson, existing });
    const row = manifest.versions.find((r) => r.id === '1.21.4');
    expect(calls).not.toContain(row.url);
    expect(file.versions.find((v) => v.id === '1.21.4').javaMajor).toBe(99);
    expect(reused).toBe(1);
    const snapRow = manifest.versions.find((r) => r.id === '26.4-snapshot-7');
    expect(calls).toContain(snapRow.url);
    // The sentinel (99) was replaced by the freshly fetched value from the recorded fixture.
    expect(file.versions.find((v) => v.id === '26.4-snapshot-7').javaMajor).toBe(
      fx('version-26.4-snapshot-7.json').javaVersion.majorVersion,
    );
  });

  it('fails (no result) when any version fetch fails', async () => {
    const row = manifest.versions.find((r) => r.id === '1.21.4');
    const { fetchJson } = stub({ failUrl: row.url });
    await expect(buildVersions({ fetchJson })).rejects.toThrow(/500/);
  });

  it('refuses when the latest release has no usable server download', async () => {
    const latestRow = manifest.versions.find((r) => r.id === manifest.latest.release);
    const { fetchJson } = stub({
      overrides: { [latestRow.url]: { id: latestRow.id, downloads: {} } },
    });
    await expect(buildVersions({ fetchJson })).rejects.toThrow(/latest release/);
  });

  it('refuses when too many versions are unusable', async () => {
    const overrides = {};
    for (const r of manifest.versions) overrides[r.url] = { id: r.id, downloads: {} };
    const { fetchJson } = stub({ overrides });
    await expect(buildVersions({ fetchJson })).rejects.toThrow(/too many unusable/);
  });

  it('refuses a manifest row pointing at an unexpected host', async () => {
    const evil = {
      ...manifest,
      versions: manifest.versions.map((r) =>
        r.id === '1.21.4' ? { ...r, url: 'https://evil.example.com/1.21.4.json' } : r,
      ),
    };
    const { fetchJson } = stub({ overrides: { manifest: evil } });
    await expect(buildVersions({ fetchJson })).rejects.toThrow(/unexpected metadata URL/);
  });

  it('refuses when the result would shrink to under half of the existing file', async () => {
    const { fetchJson } = stub();
    const { file } = await buildVersions({ fetchJson });
    const bloated = {
      ...file,
      versions: Array.from({ length: file.versions.length * 3 }, () => file.versions[0]),
    };
    await expect(buildVersions({ fetchJson, existing: bloated })).rejects.toThrow(/shrank/);
  });

  it('rejects a malformed manifest', async () => {
    const fetchJson = async () => ({ nope: true });
    await expect(buildVersions({ fetchJson })).rejects.toThrow(/manifest shape/);
  });
});

describe('updateVersionsFile', () => {
  it('writes when there is no existing file', async () => {
    const { fetchJson } = stub();
    const writeFile = vi.fn();
    const r = await updateVersionsFile({ fetchJson, readExisting: () => null, writeFile });
    expect(r.written).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(1);
    const text = writeFile.mock.calls[0][0];
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text).schema).toBe(1);
  });

  it('does not write when nothing but generatedAt changed', async () => {
    const { fetchJson } = stub();
    let saved;
    await updateVersionsFile({
      fetchJson,
      readExisting: () => null,
      writeFile: (t) => (saved = JSON.parse(t)),
      now: '2026-01-01T00:00:00Z',
    });
    const writeFile = vi.fn();
    const r = await updateVersionsFile({
      fetchJson: stub().fetchJson,
      readExisting: () => saved,
      writeFile,
      now: '2026-02-02T00:00:00Z',
    });
    expect(r.written).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('never writes when the build fails midway', async () => {
    const row = manifest.versions.find((r) => r.id === '1.21.4');
    const writeFile = vi.fn();
    await expect(
      updateVersionsFile({
        fetchJson: stub({ failUrl: row.url }).fetchJson,
        readExisting: () => null,
        writeFile,
      }),
    ).rejects.toThrow();
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('fetchJsonWithRetry', () => {
  it('retries transient failures with backoff and then succeeds', async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ fine: 1 }) });
    await expect(fetchJsonWithRetry('https://x', { fetchImpl, sleep })).resolves.toEqual({
      fine: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 500);
    expect(sleep).toHaveBeenNthCalledWith(2, 1000);
  });

  it('gives up after three attempts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(
      fetchJsonWithRetry('https://x', { fetchImpl, sleep: async () => {} }),
    ).rejects.toThrow(/giving up/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('sameContent', () => {
  it('ignores generatedAt only', () => {
    const a = { schema: 1, generatedAt: 'a', versions: [1] };
    expect(sameContent(a, { ...a, generatedAt: 'b' })).toBe(true);
    expect(sameContent(a, { ...a, versions: [2] })).toBe(false);
    expect(sameContent(null, a)).toBe(false);
  });
});
