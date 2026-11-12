// Pure helpers that turn what a server jar printed/wrote on first run into a
// "version profile". No network, no processes, no filesystem.
// A profile is the per-version truth the site needs at runtime: which server.properties
// keys exist (and their defaults), and how the jar is launched.
import { parseProperties } from '../../src/core/javaProperties.mjs';

export const PROFILE_SCHEMA = 1;

/**
 * Option names from a joptsimple `--help` table: lines that start with `--name`.
 * @param {string} helpText
 * @returns {string[]} e.g. ['--bonusChest', '--nogui', ...] in printed order, deduplicated
 */
export function parseHelpOptions(helpText) {
  const seen = new Set();
  for (const line of helpText.split(/\r?\n/)) {
    const m = /^(--[A-Za-z][\w-]*)/.exec(line);
    if (m) seen.add(m[1]);
  }
  return [...seen];
}

/**
 * Keys whose value differs between two independent first runs of the same jar
 * (or exists in only one). Today that is `management-server-secret`, a random token
 * the server makes on each run: it must never be copied into a template.
 * @param {{key:string,value:string}[]} a
 * @param {{key:string,value:string}[]} b
 */
export function findVolatileKeys(a, b) {
  const other = new Map(b.map((e) => [e.key, e.value]));
  const mine = new Set(a.map((e) => e.key));
  const volatile = new Set();
  for (const e of a) if (!other.has(e.key) || other.get(e.key) !== e.value) volatile.add(e.key);
  for (const e of b) if (!mine.has(e.key)) volatile.add(e.key);
  return [...volatile];
}

/**
 * Build the profile JSON object for one version.
 * @param {object} input
 * @param {{id:string, jar:{sha1:string}, javaMajor:number}} input.entry  a versions.json entry
 * @param {string} input.propertiesA  server.properties text from first run
 * @param {string} input.propertiesB  server.properties text from an independent second run
 * @param {string} input.helpText     output of `--help`
 * @param {boolean} input.bundler     jar contains META-INF/versions.list
 * @param {number} [input.dataVersion] `world_version` from the jar's version.json: the newest
 *                                     world format this server can open (see readDataVersion)
 */
export function buildProfile({ entry, propertiesA, propertiesB, helpText, bundler, dataVersion }) {
  const a = parseProperties(propertiesA);
  const b = parseProperties(propertiesB);
  const volatile = findVolatileKeys(a, b).sort();
  const skip = new Set(volatile);
  const properties = a
    .filter((e) => !skip.has(e.key))
    .map((e) => ({ key: e.key, default: e.value }));

  // A failed or partial first run must not become a profile.
  const keys = new Set(properties.map((p) => p.key));
  if (properties.length < 20 || !keys.has('server-port') || !keys.has('motd')) {
    throw new Error(
      `profile for ${entry.id}: server.properties looks incomplete (${properties.length} keys)`,
    );
  }

  const options = parseHelpOptions(helpText);
  if (options.length === 0) throw new Error(`profile for ${entry.id}: --help listed no options`);
  // Recent jars list `--nogui`; older ones only understood the bare word `nogui`.
  const nogui = options.includes('--nogui') ? '--nogui' : 'nogui';

  return {
    schema: PROFILE_SCHEMA,
    id: entry.id,
    jarSha1: entry.jar.sha1,
    javaMajor: entry.javaMajor,
    ...(Number.isInteger(dataVersion) ? { dataVersion } : {}),
    launch: { bundler, nogui, options },
    properties,
    volatile,
  };
}

/**
 * The world format version of a server jar, from the version.json at the top of the jar.
 * Maps saved by a newer Minecraft cannot be opened by this server. Null if unreadable.
 * @param {unknown} versionJson parsed version.json
 */
export function worldVersionOf(versionJson) {
  const n = versionJson && typeof versionJson === 'object' ? versionJson.world_version : undefined;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** True if a profile that is otherwise current still lacks the world format version. */
export function lacksDataVersion(profile) {
  return !!profile && !Number.isInteger(profile.dataVersion);
}

/** True if an existing profile still describes this exact jar and schema. */
export function profileIsCurrent(profile, entry) {
  return (
    !!profile &&
    profile.schema === PROFILE_SCHEMA &&
    profile.id === entry.id &&
    profile.jarSha1 === entry.jar.sha1
  );
}
