// Snapshot job: reads Mojang's public manifest and writes public/versions.json.
// Fails safe: on any error nothing is
// written, so the previous file stays in place (stale list, never a broken one).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  META_HOSTS,
  buildVersionsFile,
  isAllowedHttpsUrl,
  isValidEntry,
  selectVersions,
  toEntry,
} from './lib/versions.mjs';

export const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

/** Retry a JSON GET with backoff. `fetchImpl` is injectable for tests. */
export async function fetchJsonWithRetry(
  url,
  { fetchImpl = fetch, retries = 3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`giving up on ${url}: ${lastError?.message ?? lastError}`);
}

/** Run `fn` over `items` with at most `limit` in flight; preserves result order. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** True when two files differ only in `generatedAt`. */
export function sameContent(a, b) {
  if (!a || !b) return false;
  const strip = (f) => JSON.stringify({ ...f, generatedAt: undefined });
  return strip(a) === strip(b);
}

/**
 * Build the new file. Pure with respect to disk: all I/O comes in through arguments.
 * Throws on anything that should stop a write.
 */
export async function buildVersions({
  fetchJson,
  existing = null,
  now = new Date().toISOString(),
  concurrency = 8,
  log = () => {},
}) {
  const manifest = await fetchJson(MANIFEST_URL);
  if (
    typeof manifest?.latest?.release !== 'string' ||
    typeof manifest?.latest?.snapshot !== 'string' ||
    !Array.isArray(manifest?.versions)
  ) {
    throw new Error('unexpected manifest shape');
  }

  const rows = selectVersions(manifest);

  // Released versions never change, so reuse what we already have. Snapshots are re-fetched.
  const known = new Map(
    (existing?.versions ?? [])
      .filter((e) => isValidEntry(e) && e.type === 'release')
      .map((e) => [e.id, e]),
  );

  const skipped = [];
  let fetched = 0;
  let reused = 0;
  const entries = await mapLimit(rows, concurrency, async (row) => {
    if (row.type === 'release' && known.has(row.id)) {
      reused++;
      return known.get(row.id);
    }
    if (!isAllowedHttpsUrl(row.url, META_HOSTS)) {
      throw new Error(`manifest row ${row.id} has an unexpected metadata URL: ${row.url}`);
    }
    const versionJson = await fetchJson(row.url);
    fetched++;
    const entry = toEntry(row, versionJson);
    if (!entry) {
      skipped.push(row.id);
      log(`skipped ${row.id}: no usable server download`);
    }
    return entry;
  });

  if (skipped.length > rows.length / 4) {
    throw new Error(
      `too many unusable versions (${skipped.length} of ${rows.length}); refusing to write`,
    );
  }
  const kept = entries.filter(Boolean);

  if (existing?.versions?.length && kept.length < existing.versions.length / 2) {
    throw new Error(
      `result shrank from ${existing.versions.length} to ${kept.length} entries; refusing to write`,
    );
  }

  const file = buildVersionsFile(manifest, kept, now);
  return { file, fetched, reused, skipped };
}

/** Read, build, and write only when something actually changed. */
export async function updateVersionsFile({
  fetchJson,
  readExisting,
  writeFile,
  now,
  concurrency,
  log = () => {},
}) {
  const existing = readExisting();
  const result = await buildVersions({ fetchJson, existing, now, concurrency, log });
  if (sameContent(existing, result.file)) {
    log('versions.json unchanged');
    return { ...result, written: false };
  }
  writeFile(JSON.stringify(result.file, null, 2) + '\n');
  return { ...result, written: true };
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(process.argv[2] ?? resolve(here, '../public/versions.json'));
  const log = (msg) => console.log(msg);
  try {
    const result = await updateVersionsFile({
      fetchJson: (url) => fetchJsonWithRetry(url),
      readExisting: () => (existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null),
      writeFile: (text) => {
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, text);
      },
      log,
    });
    log(
      `${result.written ? 'wrote' : 'kept'} ${outPath}: ${result.file.versions.length} versions ` +
        `(${result.fetched} fetched, ${result.reused} reused, ${result.skipped.length} skipped)`,
    );
  } catch (err) {
    console.error(`versions update failed, nothing written: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
