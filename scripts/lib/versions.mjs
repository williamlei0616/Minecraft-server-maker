// Pure helpers for the snapshot job. No network, no filesystem.

/**
 * Oldest release we offer. Releases before this ship a vulnerable log4j (Log4Shell);
 * checked against each version's own JSON: log4j-core is 2.14.1 up to 1.18.1 and
 * 2.17.0 from 1.18.2 on. Change in exactly one place.
 */
export const FLOOR_ID = '1.18.2';

import { JAR_HOSTS, META_HOSTS, isAllowedHttpsUrl } from '../../src/core/hosts.mjs';

// Re-exported so existing imports keep working; the allowlist lives in src/core/hosts.mjs.
export { JAR_HOSTS, META_HOSTS, isAllowedHttpsUrl };

/**
 * Pick which manifest rows to offer. Position in the manifest (newest first) decides,
 * never version-string parsing: "26.3" and "1.21.4" do not compare as numbers.
 *  - releases: from the newest down to and including the floor
 *  - snapshots: only those newer than the latest release
 *  - old_beta / old_alpha: never
 * @param {{latest:{release:string}, versions:Array<{id:string,type:string}>}} manifest
 * @param {string} [floorId]
 */
export function selectVersions(manifest, floorId = FLOOR_ID) {
  const rows = manifest.versions;
  const floorIdx = rows.findIndex((r) => r.id === floorId);
  if (floorIdx === -1) throw new Error(`floor version ${floorId} not found in manifest`);
  const latestIdx = rows.findIndex((r) => r.id === manifest.latest.release);
  if (latestIdx === -1) {
    throw new Error(`latest release ${manifest.latest.release} not found in manifest`);
  }
  return rows.filter((row, i) => {
    if (row.type === 'release') return i <= floorIdx;
    if (row.type === 'snapshot') return i < latestIdx;
    return false;
  });
}

/**
 * Turn a manifest row plus that version's own JSON into a versions.json entry.
 * Returns null (caller logs and skips) when the entry is unusable or looks wrong.
 * @returns {null | {id:string,type:'release'|'snapshot',releaseTime:string,jar:{url:string,sha1:string,size:number},javaMajor:number}}
 */
export function toEntry(row, versionJson) {
  const server = versionJson?.downloads?.server;
  if (!server) return null;
  if (versionJson.id !== row.id) return null;
  if (row.type !== 'release' && row.type !== 'snapshot') return null;
  if (!isAllowedHttpsUrl(server.url, JAR_HOSTS)) return null;
  if (typeof server.sha1 !== 'string' || !/^[0-9a-f]{40}$/.test(server.sha1)) return null;
  if (!Number.isInteger(server.size) || server.size <= 0) return null;
  const javaMajor = versionJson.javaVersion?.majorVersion;
  if (!Number.isInteger(javaMajor) || javaMajor < 1) return null;
  if (typeof row.releaseTime !== 'string') return null;
  return {
    id: row.id,
    type: row.type,
    releaseTime: row.releaseTime,
    jar: { url: server.url, sha1: server.sha1, size: server.size },
    javaMajor,
  };
}

/** True if an entry read back from an existing versions.json is still well formed. */
export function isValidEntry(e) {
  return (
    !!e &&
    typeof e.id === 'string' &&
    (e.type === 'release' || e.type === 'snapshot') &&
    typeof e.releaseTime === 'string' &&
    isAllowedHttpsUrl(e.jar?.url, JAR_HOSTS) &&
    /^[0-9a-f]{40}$/.test(e.jar?.sha1 ?? '') &&
    Number.isInteger(e.jar?.size) &&
    Number.isInteger(e.javaMajor)
  );
}

/**
 * Assemble the file. Throws (so the caller writes nothing) if the result is not sane.
 * @param {{latest:{release:string,snapshot:string}}} manifest
 * @param {Array<object>} entries already in manifest order
 * @param {string} generatedAt ISO timestamp
 */
export function buildVersionsFile(manifest, entries, generatedAt) {
  if (entries.length === 0) throw new Error('no versions produced');
  if (!entries.some((e) => e.id === manifest.latest.release)) {
    throw new Error(`result is missing the latest release ${manifest.latest.release}`);
  }
  return {
    schema: 1,
    generatedAt,
    latest: { release: manifest.latest.release, snapshot: manifest.latest.snapshot },
    versions: entries,
  };
}
