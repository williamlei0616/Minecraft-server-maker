// Runs the real generated start scripts (start.bat through cmd on Windows, start.sh through sh)
// against a local stand-in for Mojang's name lookup and a fake `java`, and checks the files
// they leave behind. The jar is a few bytes already sitting in the cache, so nothing is
// downloaded. The only difference from a player's machine is where the lookup answers come from.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  renderPlayersPs1,
  renderStartBat,
  renderStartSh,
  type ScriptInput,
} from '../../src/core/scripts';

const IS_WINDOWS = process.platform === 'win32';

const findSh = (): string | undefined => {
  const candidates = [
    'sh',
    'C:\\Program Files\\Git\\usr\\bin\\sh.exe',
    'C:\\Program Files\\Git\\bin\\sh.exe',
  ];
  return candidates.find(
    (c) => spawnSync(c, ['-c', 'echo ok'], { encoding: 'utf8' }).stdout?.trim() === 'ok',
  );
};
const SH = findSh();

const JAR_BYTES = Buffer.from('not a real jar, just bytes with a known sha1\n');
const JAR_SHA1 = createHash('sha1').update(JAR_BYTES).digest('hex');

const idOf = (name: string): string => createHash('md5').update(name.toLowerCase()).digest('hex');
const dashed = (id: string): string =>
  `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;

// Names the stand-in lookup knows, with the capitalisation Mojang would return.
const KNOWN = [
  'Notch',
  'Alex',
  'Steve_01',
  'Griefer99',
  ...Array.from({ length: 12 }, (_, i) => `Friend${String(i + 1).padStart(2, '0')}`),
];

let server: Server;
let apiUrl = '';
let mode: 'ok' | 'down' = 'ok';
let batches: string[][] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/bulk') {
        res.writeHead(404).end();
        return;
      }
      if (mode === 'down') {
        res.writeHead(500).end('{"error":"down"}');
        return;
      }
      const names = JSON.parse(body) as string[];
      batches.push(names);
      const out = names.flatMap((n) => {
        const real = KNOWN.find((k) => k.toLowerCase() === n.toLowerCase());
        return real ? [{ id: idOf(real), name: real }] : [];
      });
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (addr && typeof addr === 'object') apiUrl = `http://127.0.0.1:${addr.port}/bulk`;
});
afterAll(() => {
  server.close();
});

const baseInput = (over: Partial<ScriptInput> = {}): ScriptInput => ({
  versionId: '26.3',
  jarUrl:
    'https://piston-data.mojang.com/v1/objects/0000000000000000000000000000000000000000/server.jar',
  jarSha1: JAR_SHA1,
  jarMegabytes: 1,
  javaMajor: 17,
  jvmArgs: ['-Xms1G', '-Xmx4G'],
  jarArgs: ['--nogui'],
  opUsername: '',
  ...over,
});

interface Sandbox {
  dir: string;
  bin: string;
  cache: string;
  mark: string;
}

/** A fresh server folder with the scripts, a cached jar and a fake java on the PATH. */
function sandbox(kind: 'bat' | 'sh', input: ScriptInput): Sandbox {
  const root = mkdtempSync(join(tmpdir(), `mcsm-${kind}-`));
  const dir = join(root, 'server');
  const bin = join(root, 'bin');
  const cache = join(root, 'cache');
  for (const d of [dir, bin, cache]) mkdirSync(d, { recursive: true });
  writeFileSync(join(cache, `${JAR_SHA1}.jar`), JAR_BYTES);
  const mark = join(root, 'java-ran.txt');
  if (kind === 'bat') {
    writeFileSync(join(dir, 'start.bat'), renderStartBat(input));
    writeFileSync(join(dir, 'players.ps1'), renderPlayersPs1(input));
    writeFileSync(
      join(bin, 'java.cmd'),
      [
        '@echo off',
        'if "%1"=="-version" (',
        '  echo openjdk version "21.0.1" 2024-10-15 1>&2',
        '  exit /b 0',
        ')',
        'echo %*> "%MCSM_TEST_MARK%"',
        'exit /b 0',
        '',
      ].join('\r\n'),
    );
  } else {
    writeFileSync(join(dir, 'start.sh'), renderStartSh(input));
    writeFileSync(
      join(bin, 'java'),
      [
        '#!/bin/sh',
        'if [ "$1" = "-version" ]; then echo \'openjdk version "21.0.1" 2024-10-15\' >&2; exit 0; fi',
        'echo "$*" > "$MCSM_TEST_MARK"',
        'exit 0',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
  }
  return { dir, bin, cache, mark };
}

// sha1sum prints a leading backslash for names containing one, so the Unix script gets
// forward slashes (Git Bash accepts them; a player's Mac or Linux has no backslashes anyway).
const shPath = (kind: 'bat' | 'sh', p: string): string =>
  kind === 'sh' ? p.split('\\').join('/') : p;

function run(kind: 'bat' | 'sh', box: Sandbox): Promise<{ code: number | null; out: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = `${box.bin}${delimiter}${env[pathKey] ?? ''}`;
  Object.assign(env, {
    MCSM_CACHE_DIR: shPath(kind, box.cache),
    MCSM_NO_PAUSE: '1',
    MCSM_LOOKUP_API: apiUrl,
    MCSM_TEST_MARK: shPath(kind, box.mark),
    MSYS2_ARG_CONV_EXCL: '*',
    MSYS_NO_PATHCONV: '1',
  });
  const child =
    kind === 'bat'
      ? spawn('cmd.exe', ['/d', '/c', '.\\start.bat'], { cwd: box.dir, env })
      : spawn(SH!, ['start.sh'], { cwd: box.dir, env });
  return new Promise((resolve) => {
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    const timer = setTimeout(() => child.kill(), 90_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

const json = (box: Sandbox, file: string): Record<string, unknown>[] =>
  JSON.parse(readFileSync(join(box.dir, file), 'utf8').replace(/^\uFEFF/, ''));

const kinds: ('bat' | 'sh')[] = [];
if (IS_WINDOWS) kinds.push('bat');
if (SH) kinds.push('sh');

describe.each(kinds)('real %s run with a stand-in Mojang lookup', (kind) => {
  const allowed = Array.from({ length: 12 }, (_, i) => `Friend${String(i + 1).padStart(2, '0')}`);

  it('writes the operator, allow list, block list and blocked addresses, then starts', async () => {
    mode = 'ok';
    batches = [];
    const box = sandbox(
      kind,
      baseInput({
        opUsername: 'Notch',
        whitelist: true,
        allowedPlayers: allowed,
        blockedPlayers: ['Griefer99', 'NoSuchPlayer'],
        blockedIps: ['203.0.113.7', '2001:db8::1'],
      }),
    );
    const r = await run(kind, box);

    expect(existsSync(box.mark), r.out).toBe(true); // the server was started
    expect(readFileSync(box.mark, 'utf8')).toContain('-Xmx4G');

    const ops = json(box, 'ops.json');
    expect(ops).toEqual([
      { uuid: dashed(idOf('Notch')), name: 'Notch', level: 4, bypassesPlayerLimit: false },
    ]);

    const white = json(box, 'whitelist.json');
    expect(white.map((w) => w.name)).toEqual([...allowed, 'Notch']); // owner is added automatically
    expect(white[0]).toEqual({ uuid: dashed(idOf('Friend01')), name: 'Friend01' });

    const banned = json(box, 'banned-players.json');
    expect(banned).toHaveLength(1);
    expect(banned[0]).toMatchObject({
      uuid: dashed(idOf('Griefer99')),
      name: 'Griefer99',
      expires: 'forever',
    });
    expect(String(banned[0]!.created)).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \+0000$/);

    expect(json(box, 'banned-ips.json').map((b) => b.ip)).toEqual(['203.0.113.7', '2001:db8::1']);

    // 15 distinct names (owner + 12 + 2 blocked, one unknown) are looked up 10 at a time
    expect(batches.map((b) => b.length)).toEqual([10, 5]);
    // a name that does not exist is reported, and the server still started
    expect(r.out).toContain('NoSuchPlayer');
    expect(r.out).toContain('ban NoSuchPlayer');
    rmSync(box.dir, { recursive: true, force: true });
  }, 120_000);

  it('does nothing online when there is no operator and no list', async () => {
    mode = 'ok';
    batches = [];
    const box = sandbox(kind, baseInput());
    const r = await run(kind, box);
    expect(existsSync(box.mark), r.out).toBe(true);
    expect(batches).toEqual([]);
    for (const f of ['ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json']) {
      expect(existsSync(join(box.dir, f)), f).toBe(false);
    }
  }, 120_000);

  it('keeps lists that already have people in them, but fills empty ones', async () => {
    mode = 'ok';
    batches = [];
    const box = sandbox(
      kind,
      baseInput({ opUsername: 'Notch', whitelist: true, allowedPlayers: ['Alex'] }),
    );
    const mine = '[{"uuid":"11111111-1111-1111-1111-111111111111","name":"Mine"}]';
    writeFileSync(join(box.dir, 'ops.json'), mine);
    writeFileSync(join(box.dir, 'whitelist.json'), '[]'); // what a first server start leaves behind
    const r = await run(kind, box);
    expect(existsSync(box.mark), r.out).toBe(true);
    expect(readFileSync(join(box.dir, 'ops.json'), 'utf8')).toBe(mine);
    expect(json(box, 'whitelist.json').map((w) => w.name)).toEqual(['Alex', 'Notch']);
  }, 120_000);

  it('refuses to start when the allow list is on and nobody could be looked up', async () => {
    mode = 'down';
    batches = [];
    const box = sandbox(kind, baseInput({ whitelist: true, allowedPlayers: ['Alex'] }));
    const r = await run(kind, box);
    mode = 'ok';
    expect(existsSync(box.mark), r.out).toBe(false); // the server must not start locked
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('locked out');
    expect(r.out).toContain('Could not reach Mojang');
    expect(existsSync(join(box.dir, 'whitelist.json'))).toBe(false);
  }, 120_000);

  it('starts anyway when only the optional parts failed (allow list off)', async () => {
    mode = 'down';
    const box = sandbox(kind, baseInput({ opUsername: 'Notch', blockedPlayers: ['Griefer99'] }));
    const r = await run(kind, box);
    mode = 'ok';
    expect(existsSync(box.mark), r.out).toBe(true);
    expect(r.out).toContain('op Notch'); // tells the player the manual fix
    expect(r.out).toContain('ban Griefer99');
  }, 120_000);
});
