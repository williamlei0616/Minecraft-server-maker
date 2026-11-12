// Loading and checking per-version profiles at runtime.
// The browser fetches ONE small file (`profiles/<id>.json`) when a version is chosen.
import type { BundleLocale, VersionEntry, VersionProfile } from './types';

export type ProfileErrorCode = 'network' | 'missing' | 'shape' | 'mismatch';

export class ProfileError extends Error {
  readonly code: ProfileErrorCode;
  constructor(code: ProfileErrorCode, message: string) {
    super(message);
    this.name = 'ProfileError';
    this.code = code;
  }
}

/** Where the site is served from, and how to fetch. Both optional; defaults suit a browser. */
export interface CoreContext {
  /** Prefix for site files, e.g. '' or '/Minecraft-server-maker'. No trailing slash needed. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Language of the bundle's README (default English). The start scripts stay English. */
  locale?: BundleLocale;
  /**
   * Address of the site's help page in the same language, e.g. https://example.com/zh-hant/help/.
   * The start scripts print it (with a #topic) next to Java and download problems.
   */
  helpUrl?: string;
}

export function profileUrl(id: string, baseUrl = ''): string {
  return `${baseUrl.replace(/\/+$/, '')}/profiles/${encodeURIComponent(id)}.json`;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate untrusted JSON into a VersionProfile or throw ProfileError('shape'). */
export function parseProfile(data: unknown): VersionProfile {
  const bad = (why: string): never => {
    throw new ProfileError('shape', `profile is malformed: ${why}`);
  };
  if (!isRecord(data)) return bad('not an object');
  if (data.schema !== 1) return bad(`unsupported schema ${String(data.schema)}`);
  if (typeof data.id !== 'string' || data.id === '') return bad('id');
  if (typeof data.jarSha1 !== 'string' || !/^[0-9a-f]{40}$/.test(data.jarSha1))
    return bad('jarSha1');
  if (!Number.isInteger(data.javaMajor)) return bad('javaMajor');
  if (
    data.dataVersion !== undefined &&
    !(Number.isInteger(data.dataVersion) && (data.dataVersion as number) > 0)
  )
    return bad('dataVersion');

  const launch = data.launch;
  if (!isRecord(launch)) return bad('launch');
  if (typeof launch.bundler !== 'boolean') return bad('launch.bundler');
  if (launch.nogui !== '--nogui' && launch.nogui !== 'nogui') return bad('launch.nogui');
  if (!Array.isArray(launch.options) || !launch.options.every((o) => typeof o === 'string'))
    return bad('launch.options');

  if (!Array.isArray(data.properties) || data.properties.length === 0) return bad('properties');
  const seen = new Set<string>();
  for (const p of data.properties) {
    if (!isRecord(p) || typeof p.key !== 'string' || p.key === '' || typeof p.default !== 'string')
      return bad('property entry');
    if (seen.has(p.key)) return bad(`duplicate key ${p.key}`);
    seen.add(p.key);
  }
  if (!seen.has('server-port') || !seen.has('motd')) return bad('missing core keys');
  if (!Array.isArray(data.volatile) || !data.volatile.every((k) => typeof k === 'string'))
    return bad('volatile');
  for (const k of data.volatile as string[])
    if (seen.has(k)) return bad(`volatile key ${k} is also templated`);

  return data as unknown as VersionProfile;
}

/**
 * Fetch and check the profile for a version-list entry. It must describe exactly the jar
 * the list points at, otherwise defaults and jar could disagree.
 */
export async function loadProfile(
  entry: VersionEntry,
  ctx: CoreContext = {},
): Promise<VersionProfile> {
  const doFetch = ctx.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(profileUrl(entry.id, ctx.baseUrl));
  } catch (err) {
    throw new ProfileError(
      'network',
      `could not reach the profile for ${entry.id}: ${(err as Error).message}`,
    );
  }
  if (res.status === 404) throw new ProfileError('missing', `no profile for ${entry.id} yet`);
  if (!res.ok) throw new ProfileError('network', `profile for ${entry.id}: HTTP ${res.status}`);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ProfileError('shape', `profile for ${entry.id} is not valid JSON`);
  }
  const profile = parseProfile(json);
  if (profile.id !== entry.id || profile.jarSha1 !== entry.jar.sha1) {
    throw new ProfileError('mismatch', `profile for ${entry.id} does not match the listed jar`);
  }
  return profile;
}
