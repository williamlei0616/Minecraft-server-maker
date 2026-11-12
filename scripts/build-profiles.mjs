// Profile job: for every version in public/versions.json, run that version's real server
// jar once with `--initSettings` (writes server.properties + eula.txt and quits: no world,
// no EULA acceptance) and record what it produced in public/profiles/<id>.json.
//
// The jar is downloaded to a throwaway directory, checked against Mojang's sha1, run, and
// deleted. Nothing from Mojang is kept or served. Only our own small JSON summary is.
//
//   node scripts/build-profiles.mjs            create/refresh missing profiles
//   node scripts/build-profiles.mjs --check    verify every listed version has a current profile
//
// Java: each jar needs its `javaMajor` or newer. Point at installs with env vars
// MCSM_JAVA_<major>=/path/to/java (or JAVA_HOME_<major>_X64 as set by setup-java);
// plain `java` on PATH is also considered.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import {
  buildProfile,
  lacksDataVersion,
  profileIsCurrent,
  worldVersionOf,
} from './lib/profile.mjs';
import { JAR_HOSTS, isAllowedHttpsUrl } from './lib/versions.mjs';

const execFileP = promisify(execFile);
const RUN_TIMEOUT_MS = 120_000;

/* ------------------------------------------------------------------ Java discovery */

/** Candidate java executables from the environment, as [path, label] pairs. */
export function javaCandidates(env = process.env) {
  const out = [];
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    if (/^MCSM_JAVA_\d+$/.test(name)) out.push(value);
    else if (/^JAVA_HOME_\d+_[A-Z0-9]+$/.test(name)) out.push(join(value, 'bin', exe));
  }
  out.push('java');
  return [...new Set(out)];
}

/** Parse the major version out of `java -version` text ("1.8.0_481" -> 8, "21.0.7" -> 21). */
export function parseJavaMajor(text) {
  const m = /version "(\d+)(?:\.(\d+))?/.exec(text);
  if (!m) return null;
  return m[1] === '1' ? Number(m[2]) : Number(m[1]);
}

async function probeJava(bin) {
  try {
    const { stdout, stderr } = await execFileP(bin, ['-version'], { timeout: 20_000 });
    return parseJavaMajor(`${stdout}\n${stderr}`);
  } catch {
    return null;
  }
}

/** Pick the smallest installed Java whose major is >= `needed`. */
export async function chooseJava(needed, candidates = javaCandidates(), probe = probeJava) {
  let best = null;
  for (const bin of candidates) {
    const major = await probe(bin);
    if (major !== null && major >= needed && (best === null || major < best.major))
      best = { bin, major };
  }
  return best;
}

/* ------------------------------------------------------------------ real I/O deps */

async function download(url) {
  if (!isAllowedHttpsUrl(url, JAR_HOSTS)) throw new Error(`refusing to download from ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!isAllowedHttpsUrl(res.url, JAR_HOSTS))
    throw new Error(`redirected to disallowed host: ${res.url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function hasBundlerMarker(jar) {
  const zip = await JSZip.loadAsync(jar);
  return zip.file('META-INF/versions.list') !== null;
}

/**
 * Run java with a minimal environment: the jar is third-party code, so it gets no
 * tokens or credentials from ours. HOME is the throwaway work directory.
 */
async function runJava({ bin, cwd, args }) {
  const env = {
    PATH: process.env.PATH ?? '',
    SystemRoot: process.env.SystemRoot ?? '',
    TEMP: cwd,
    TMP: cwd,
    TMPDIR: cwd,
    HOME: cwd,
    USERPROFILE: cwd,
  };
  try {
    const { stdout, stderr } = await execFileP(bin, ['-Xmx512M', ...args], {
      cwd,
      env,
      timeout: RUN_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { status: 0, stdout, stderr };
  } catch (err) {
    return {
      status: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? String(err),
    };
  }
}

/** `world_version` from the version.json at the top of the jar, or null. */
async function readDataVersion(jar) {
  try {
    const zip = await JSZip.loadAsync(jar);
    const file = zip.file('version.json');
    return file ? worldVersionOf(JSON.parse(await file.async('string'))) : null;
  } catch {
    return null;
  }
}

export const realDeps = { download, hasBundlerMarker, runJava, chooseJava, readDataVersion };

/* ------------------------------------------------------------------ extraction */

function makeWorkDir(prefix, jar) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(dir, 'server.jar'), jar);
  return dir;
}

/**
 * Download one version's jar, verify it, run it twice (fresh directory each time) and
 * once for --help, and build the profile. Deps are injectable so tests need no network
 * or Java.
 */
export async function extractProfile(entry, deps = realDeps) {
  const jar = await deps.download(entry.jar.url);
  if (jar.length !== entry.jar.size) {
    throw new Error(`${entry.id}: jar is ${jar.length} bytes, expected ${entry.jar.size}`);
  }
  const sha1 = createHash('sha1').update(jar).digest('hex');
  if (sha1 !== entry.jar.sha1) throw new Error(`${entry.id}: sha1 mismatch (${sha1})`);

  const java = await deps.chooseJava(entry.javaMajor);
  if (!java)
    throw new Error(
      `${entry.id}: no Java ${entry.javaMajor}+ available (set MCSM_JAVA_${entry.javaMajor})`,
    );

  const bundler = await deps.hasBundlerMarker(jar);
  const dataVersion = deps.readDataVersion ? await deps.readDataVersion(jar) : null;
  if (deps.readDataVersion && dataVersion === null)
    throw new Error(`${entry.id}: version.json in the jar has no world_version`);
  const texts = [];
  let helpText = '';
  for (let run = 0; run < 2; run++) {
    const dir = makeWorkDir('mcsm-profile-', jar);
    try {
      const init = await deps.runJava({
        bin: java.bin,
        cwd: dir,
        args: ['-jar', 'server.jar', '--initSettings'],
      });
      if (init.status !== 0)
        throw new Error(
          `${entry.id}: --initSettings exited ${init.status}: ${init.stderr.slice(-300)}`,
        );
      const propsPath = join(dir, 'server.properties');
      if (!existsSync(propsPath))
        throw new Error(`${entry.id}: --initSettings wrote no server.properties`);
      const eula = existsSync(join(dir, 'eula.txt'))
        ? readFileSync(join(dir, 'eula.txt'), 'utf8')
        : '';
      // We must never have accepted the EULA on anyone's behalf.
      if (/^\s*eula\s*=\s*true/im.test(eula))
        throw new Error(`${entry.id}: eula.txt unexpectedly says true`);
      texts.push(readFileSync(propsPath, 'utf8'));
      if (run === 0) {
        const help = await deps.runJava({
          bin: java.bin,
          cwd: dir,
          args: ['-jar', 'server.jar', '--help'],
        });
        helpText = `${help.stdout}\n${help.stderr}`;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return buildProfile({
    entry,
    propertiesA: texts[0],
    propertiesB: texts[1],
    helpText,
    bundler,
    ...(dataVersion === null ? {} : { dataVersion }),
  });
}

/**
 * Add the world format version to an existing, otherwise current profile. Needs only the jar
 * (no Java): download, check the sha1, read version.json. Everything else is left as it was.
 */
export async function backfillDataVersion(entry, profile, deps = realDeps) {
  const jar = await deps.download(entry.jar.url);
  const sha1 = createHash('sha1').update(jar).digest('hex');
  if (sha1 !== entry.jar.sha1) throw new Error(`${entry.id}: sha1 mismatch (${sha1})`);
  const dataVersion = await deps.readDataVersion(jar);
  if (dataVersion === null)
    throw new Error(`${entry.id}: version.json in the jar has no world_version`);
  const { schema, id, jarSha1, javaMajor, launch, properties, volatile } = profile;
  return { schema, id, jarSha1, javaMajor, dataVersion, launch, properties, volatile };
}

/* ------------------------------------------------------------------ orchestration */

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

/**
 * Make sure every listed version has a current profile. Returns what changed.
 * `readProfile(id)` -> object|null, `writeProfile(id, obj)`, `listProfileIds()`, `removeProfile(id)`.
 */
export async function updateProfiles({
  versions,
  readProfile,
  writeProfile,
  listProfileIds,
  removeProfile,
  extract = extractProfile,
  backfill = backfillDataVersion,
  concurrency = 3,
  log = () => {},
}) {
  const todo = versions.filter((v) => !profileIsCurrent(readProfile(v.id), v));
  const needData = versions.filter((v) => {
    const p = readProfile(v.id);
    return profileIsCurrent(p, v) && lacksDataVersion(p);
  });
  const failures = [];
  const written = [];
  await mapLimit(todo, concurrency, async (entry) => {
    try {
      const profile = await extract(entry);
      writeProfile(entry.id, profile);
      written.push(entry.id);
      log(`profiled ${entry.id} (${profile.properties.length} properties)`);
    } catch (err) {
      failures.push({ id: entry.id, message: err.message });
      log(`FAILED ${entry.id}: ${err.message}`);
    }
  });
  await mapLimit(needData, concurrency, async (entry) => {
    try {
      const profile = await backfill(entry, readProfile(entry.id));
      writeProfile(entry.id, profile);
      written.push(entry.id);
      log(`added the world version to ${entry.id} (${profile.dataVersion})`);
    } catch (err) {
      failures.push({ id: entry.id, message: err.message });
      log(`FAILED ${entry.id}: ${err.message}`);
    }
  });
  // Only drop profiles for versions that left the list once everything else succeeded.
  const removed = [];
  if (failures.length === 0) {
    const listed = new Set(versions.map((v) => v.id));
    for (const id of listProfileIds()) {
      if (!listed.has(id)) {
        removeProfile(id);
        removed.push(id);
      }
    }
  }
  return {
    written: written.sort(),
    removed,
    failures,
    upToDate: versions.length - todo.length - needData.length,
  };
}

/** Which listed versions have no current profile (for --check and CI). */
export function missingProfiles(versions, readProfile) {
  return versions
    .filter((v) => {
      const p = readProfile(v.id);
      return !profileIsCurrent(p, v) || lacksDataVersion(p);
    })
    .map((v) => v.id);
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const publicDir = resolve(here, '../public');
  const profilesDir = join(publicDir, 'profiles');
  const versionsFile = JSON.parse(readFileSync(join(publicDir, 'versions.json'), 'utf8'));
  const pathFor = (id) => join(profilesDir, `${id}.json`);
  const readProfile = (id) =>
    existsSync(pathFor(id)) ? JSON.parse(readFileSync(pathFor(id), 'utf8')) : null;

  if (process.argv.includes('--check')) {
    const missing = missingProfiles(versionsFile.versions, readProfile);
    if (missing.length) {
      console.error(`versions without a current profile: ${missing.join(', ')}`);
      process.exit(1);
    }
    console.log(`all ${versionsFile.versions.length} versions have a current profile`);
    return;
  }

  mkdirSync(profilesDir, { recursive: true });
  const result = await updateProfiles({
    versions: versionsFile.versions,
    readProfile,
    writeProfile: (id, p) => writeFileSync(pathFor(id), JSON.stringify(p, null, 2) + '\n'),
    listProfileIds: () =>
      readdirSync(profilesDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5)),
    removeProfile: (id) => rmSync(pathFor(id), { force: true }),
    concurrency: Number(process.env.MCSM_CONCURRENCY ?? 3),
    log: (m) => console.log(m),
  });
  console.log(
    `profiles: ${result.written.length} written, ${result.upToDate} already current, ${result.removed.length} removed, ${result.failures.length} failed`,
  );
  if (result.failures.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
