// Assembles the downloadable bundle: eula.txt (only if accepted), server.properties from the
// version's profile, the two launcher scripts and a README. The server jar is never included.
import { validate } from './config';
import { checkExtraProperties, lockedKeys } from './extras';
import { buildLaunch } from './launch';
import { loadProfile, type CoreContext } from './profile';
import { planProperties, renderServerProperties } from './properties';
import { renderReadme } from './readme';
import { needsPlayersStep, renderPlayersPs1, renderStartBat, renderStartSh } from './scripts';
import type { ServerConfig, VersionEntry, VersionProfile, BundleLocale } from './types';

export type BundleErrorCode = 'invalid' | 'eula' | 'unknown-version';

export class BundleError extends Error {
  readonly code: BundleErrorCode;
  constructor(code: BundleErrorCode, message: string) {
    super(message);
    this.name = 'BundleError';
    this.code = code;
  }
}

export interface BundleFile {
  /** Path inside the bundle folder. */
  path: string;
  content: string;
  executable?: boolean;
}

export const bundleFolderName = (versionId: string): string => `minecraft-server-${versionId}`;

const EULA_TXT =
  '#You accepted the Minecraft EULA (https://aka.ms/MinecraftEULA) on the Minecraft Server Maker page.\n' +
  'eula=true\n';

/**
 * The files of a bundle, with no zip and no network. `eula.txt` is written only when the
 * config says the player accepted; without it Minecraft itself creates eula.txt (set to
 * false) on first start, which is what the CLI's --no-eula test mode relies on.
 */
export function buildBundleFiles(
  config: ServerConfig,
  entry: VersionEntry,
  profile: VersionProfile,
  options: { locale?: BundleLocale; helpUrl?: string } = {},
): BundleFile[] {
  if (config.versionId !== entry.id || profile.id !== entry.id) {
    throw new BundleError('unknown-version', 'the version, list entry and profile do not agree');
  }
  const launch = buildLaunch(profile, config);
  const scriptInput = {
    versionId: entry.id,
    jarUrl: entry.jar.url,
    jarSha1: entry.jar.sha1,
    jarMegabytes: Math.max(1, Math.round(entry.jar.size / 1048576)),
    javaMajor: launch.javaMajor,
    jvmArgs: launch.jvmArgs,
    jarArgs: launch.jarArgs,
    opUsername: config.opUsername,
    whitelist: config.whitelist,
    allowedPlayers: config.allowedPlayers,
    blockedPlayers: config.blockedPlayers,
    blockedIps: config.blockedIps,
    ...(options.helpUrl ? { helpUrl: options.helpUrl } : {}),
  };
  const files: BundleFile[] = [];
  if (config.eulaAccepted) files.push({ path: 'eula.txt', content: EULA_TXT });
  files.push(
    { path: 'server.properties', content: renderServerProperties(planProperties(profile, config)) },
    { path: 'start.bat', content: renderStartBat(scriptInput) },
    { path: 'start.sh', content: renderStartSh(scriptInput), executable: true },
    ...(needsPlayersStep(scriptInput)
      ? [{ path: 'players.ps1', content: renderPlayersPs1(scriptInput) }]
      : []),
    {
      path: 'README.txt',
      content: renderReadme(
        {
          versionId: entry.id,
          javaMajor: launch.javaMajor,
          jarMegabytes: scriptInput.jarMegabytes,
          port: config.port,
          opUsername: config.opUsername,
          gui: config.gui,
          eulaAccepted: config.eulaAccepted,
          ...(config.map ? { mapFolder: config.map.folderName } : {}),
          whitelist: config.whitelist,
          allowedCount: config.allowedPlayers.length,
          blockedCount: config.blockedPlayers.length,
          blockedIpCount: config.blockedIps.length,
          ...(options.helpUrl ? { helpUrl: options.helpUrl } : {}),
        },
        options.locale,
      ),
    },
  );
  return files;
}

/** Fixed timestamp inside the zip so identical choices produce identical bytes. */
const ZIP_DATE = new Date(Date.UTC(2020, 0, 1));

export async function zipBundle(versionId: string, files: BundleFile[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip'); // loaded only when a download is made
  const zip = new JSZip();
  const root = bundleFolderName(versionId);
  for (const f of files) {
    zip.file(`${root}/${f.path}`, f.content, {
      date: ZIP_DATE,
      // regular file, rwxr-xr-x for the Unix launcher so "./start.sh" works after unzip
      unixPermissions: f.executable ? 0o100755 : 0o100644,
    });
  }
  return zip.generateAsync({
    type: 'blob',
    platform: 'UNIX',
    compression: 'DEFLATE',
    mimeType: 'application/zip',
  });
}

/**
 * Validate, load the version's profile, build and zip. Refuses unless the EULA box was
 * ticked: the only way an `eula=true` file ever reaches a player.
 */
export async function buildBundle(
  config: ServerConfig,
  versions: VersionEntry[],
  ctx: CoreContext = {},
): Promise<Blob> {
  const result = validate(config, versions);
  if (!result.ok) throw new BundleError('invalid', 'The options are not valid yet.');
  if (!config.eulaAccepted)
    throw new BundleError('eula', 'The Minecraft EULA has not been accepted.');
  const entry = versions.find((v) => v.id === config.versionId);
  if (!entry) throw new BundleError('unknown-version', 'Unknown version.');
  const profile = await loadProfile(entry, ctx);
  if (
    checkExtraProperties(profile, config.extraProperties, lockedKeys(config)).some(
      (i) => i.level === 'error',
    )
  ) {
    throw new BundleError('invalid', 'The extra settings do not fit this version.');
  }
  return zipBundle(
    entry.id,
    buildBundleFiles(config, entry, profile, {
      ...(ctx.locale ? { locale: ctx.locale } : {}),
      ...(ctx.helpUrl ? { helpUrl: ctx.helpUrl } : {}),
    }),
  );
}
