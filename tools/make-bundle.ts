// Developer tool: build a server bundle from the command line, with no UI.
// Writes both the zip and the extracted folder under .out/ so the launcher scripts can be
// run straight away (this is how they are tested on real machines and in CI).
//
//   npm run bundle -- <versionId> [options]
//
//   --ram <GB>         1,2,3,4,6,8,12,16        (default 4)
//   --nogui | --gui                              (default --nogui, handy for tests)
//   --user <name>      make this Minecraft user an operator on first start
//   --whitelist        only the --allow names (and --user) can join
//   --allow a,b,c      names for the allow list (whitelist.json)
//   --block a,b,c      names that may never join (banned-players.json)
//   --block-ip x,y     IP addresses that may never connect (banned-ips.json)
//   --map <FolderName> the folder name of a map you will copy in next to start.bat
//                      (sets level-name and adds the map step to the README)
//   --set key=value    change any server.properties line (repeat for several)
//   --difficulty <d>   peaceful|easy|normal|hard
//   --port <n>
//   --accept-eula      write eula.txt with eula=true. You are accepting the Minecraft EULA
//                      (https://aka.ms/MinecraftEULA) by passing this. Without it the bundle
//                      has no eula.txt, so the server stops at the EULA message: safe for
//                      testing the launcher.
//   --out <dir>        default .out
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundleFiles, bundleFolderName, zipBundle } from '../src/core/bundle';
import { defaultConfig, validate } from '../src/core/config';
import { checkExtraProperties } from '../src/core/extras';
import { loadProfile } from '../src/core/profile';
import { parseVersions } from '../src/core/versions';
import type { ServerConfig } from '../src/core/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const extra: Record<string, string> = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--set') continue;
  const pair = args[i + 1] ?? '';
  const at = pair.indexOf('=');
  if (at < 1) {
    console.error(`--set wants key=value, got "${pair}"`);
    process.exit(2);
  }
  extra[pair.slice(0, at)] = pair.slice(at + 1);
}

const list = (name: string): string[] =>
  (value(name) ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');

// The version is the first argument that is neither a flag nor the value of a flag.
const VALUE_FLAGS = new Set([
  '--ram',
  '--user',
  '--difficulty',
  '--port',
  '--out',
  '--allow',
  '--block',
  '--block-ip',
  '--set',
  '--map',
]);
let versionId: string | undefined;
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (VALUE_FLAGS.has(a)) i++;
  else if (!a.startsWith('--')) {
    versionId = a;
    break;
  }
}
if (!versionId) {
  console.error(
    'usage: npm run bundle -- <versionId> [--ram 4] [--gui|--nogui] [--user NAME] [--whitelist --allow a,b] [--block a,b] [--block-ip x] [--accept-eula] [--out dir]',
  );
  process.exit(2);
}

// Read site files straight from public/ instead of over HTTP.
const localFetch = (async (url: string) => {
  try {
    return new Response(readFileSync(join(root, 'public', url)));
  } catch {
    return new Response('', { status: 404 });
  }
}) as unknown as typeof fetch;

const versions = parseVersions(
  JSON.parse(readFileSync(join(root, 'public', 'versions.json'), 'utf8')),
);
const entry = versions.versions.find((v) => v.id === versionId);
if (!entry) {
  console.error(
    `unknown version "${versionId}". Listed: ${versions.versions.map((v) => v.id).join(', ')}`,
  );
  process.exit(2);
}

const config: ServerConfig = {
  ...defaultConfig(versions),
  versionId,
  gui: flag('gui'),
  eulaAccepted: flag('accept-eula'),
  ...(value('ram') ? { ramGb: Number(value('ram')) as ServerConfig['ramGb'] } : {}),
  ...(value('user') ? { opUsername: value('user')! } : {}),
  ...(value('difficulty') ? { difficulty: value('difficulty') as ServerConfig['difficulty'] } : {}),
  whitelist: flag('whitelist'),
  allowedPlayers: list('allow'),
  blockedPlayers: list('block'),
  blockedIps: list('block-ip'),
  extraProperties: extra,
  map: value('map') ? { folderName: value('map')! } : null,
  ...(value('port') ? { port: Number(value('port')) } : {}),
};
const checked = validate(config, versions.versions);
if (!checked.ok) {
  console.error('invalid options:', checked.errors);
  process.exit(2);
}

const profile = await loadProfile(entry, { fetch: localFetch });
const bad = checkExtraProperties(profile, config.extraProperties).filter(
  (i) => i.level === 'error',
);
if (bad.length > 0) {
  console.error(
    'settings this version cannot take:',
    bad.map((i) => `${i.key} (${i.code})`).join(', '),
  );
  process.exit(2);
}
const files = buildBundleFiles(config, entry, profile);

const outDir = resolve(value('out') ?? join(root, '.out'));
const folder = join(outDir, bundleFolderName(versionId));
rmSync(folder, { recursive: true, force: true });
mkdirSync(folder, { recursive: true });
for (const f of files) {
  const target = join(folder, f.path);
  writeFileSync(target, f.content); // string write: line endings stay exactly as rendered
  if (f.executable) chmodSync(target, 0o755);
}
const zipPath = join(outDir, `${bundleFolderName(versionId)}.zip`);
writeFileSync(zipPath, Buffer.from(await (await zipBundle(versionId, files)).arrayBuffer()));

console.log(`folder: ${folder}`);
console.log(`zip:    ${zipPath}`);
console.log(`files:  ${files.map((f) => f.path).join(', ')}`);
if (!config.eulaAccepted)
  console.log('note:   no eula.txt (EULA not accepted): the server will stop at the EULA message.');
