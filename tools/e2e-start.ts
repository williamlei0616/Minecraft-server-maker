// End-to-end check of a generated bundle on THIS computer, against the real Mojang services.
// Used by CI on Windows, Linux and macOS. It builds a
// bundle with an operator, an allow list, a block list and a blocked address, runs the start
// script for real (download from Mojang, sha1 check, name lookup, start), and checks the files.
// The EULA is deliberately NOT accepted, so the server stops at the EULA message and no world is made.
//
//   npm run e2e                 # defaults to 1.21.4 (needs Java 21 or newer on the PATH)
//   npm run e2e -- 1.20.4       # another version
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] ?? '1.21.4';
const work = mkdtempSync(join(tmpdir(), 'mcsm-e2e-'));
const out = join(work, 'out');
const cache = join(work, 'cache');
const failures: string[] = [];
const check = (ok: boolean, what: string): void => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const make = spawnSync(
  'npm',
  [
    'run',
    'bundle',
    '--silent',
    '--',
    version,
    '--nogui',
    '--user',
    'Notch',
    '--whitelist',
    '--allow',
    'jeb_,Dinnerbone',
    '--block',
    'Herobrine',
    '--block-ip',
    '203.0.113.7,2001:db8::1',
    '--out',
    out,
  ],
  { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
);
if (make.status !== 0) {
  console.error(make.stdout, make.stderr);
  process.exit(2);
}
const dir = join(out, `minecraft-server-${version}`);

const windows = process.platform === 'win32';
const run = windows
  ? spawnSync('cmd.exe', ['/d', '/c', '.\\start.bat'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 600_000,
      env: env(),
    })
  : spawnSync('sh', ['start.sh'], { cwd: dir, encoding: 'utf8', timeout: 600_000, env: env() });
function env(): NodeJS.ProcessEnv {
  return { ...process.env, MCSM_NO_PAUSE: '1', MCSM_CACHE_DIR: cache };
}
const text = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
console.log(
  text
    .split('\n')
    .filter((l) => !l.includes('Unpacking'))
    .slice(-25)
    .join('\n'),
);

const versions = JSON.parse(readFileSync(join(root, 'public', 'versions.json'), 'utf8')) as {
  versions: { id: string; jar: { sha1: string } }[];
};
const sha1 = versions.versions.find((v) => v.id === version)?.jar.sha1;
const jar = join(dir, 'server.jar');
check(existsSync(jar), 'the server jar was downloaded next to the script');
check(
  existsSync(jar) && createHash('sha1').update(readFileSync(jar)).digest('hex') === sha1,
  "the jar matches Mojang's sha1",
);
check(/EULA/i.test(text), 'the server stopped at the EULA message (it was not accepted)');
check(!existsSync(join(dir, 'world')), 'no world was created');

const names = (file: string): string[] => {
  try {
    const rows = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
      name?: string;
      ip?: string;
    }[];
    return rows.map((r) => r.name ?? r.ip ?? '');
  } catch {
    return [];
  }
};
check(names('ops.json').join() === 'Notch', 'ops.json has the owner');
check(
  names('whitelist.json').join() === 'jeb_,Dinnerbone,Notch',
  'whitelist.json has the allow list and the owner',
);
check(
  names('banned-players.json').join() === 'Herobrine',
  'banned-players.json has the blocked player',
);
check(
  names('banned-ips.json').join() === '203.0.113.7,2001:db8::1',
  'banned-ips.json has both addresses',
);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ids = (
  JSON.parse(readFileSync(join(dir, 'whitelist.json'), 'utf8')) as { uuid: string }[]
).map((r) => r.uuid);
check(ids.length === 3 && ids.every((i) => uuid.test(i)), 'the UUIDs look right');

rmSync(work, { recursive: true, force: true });
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
