// Loading the version list (public/versions.json). The page reads this from its own origin.
import { JAR_HOSTS, isAllowedHttpsUrl } from './hosts.mjs';
import type { CoreContext } from './profile';
import type { VersionsFile } from './types';

export type VersionsErrorCode = 'network' | 'shape' | 'schema';

export class VersionsError extends Error {
  readonly code: VersionsErrorCode;
  constructor(code: VersionsErrorCode, message: string) {
    super(message);
    this.name = 'VersionsError';
    this.code = code;
  }
}

/** Validate untrusted JSON into a VersionsFile or throw VersionsError. */
export function parseVersions(data: unknown): VersionsFile {
  const d = data as Partial<VersionsFile> | null;
  if (typeof d !== 'object' || d === null)
    throw new VersionsError('shape', 'versions.json is not an object');
  if (d.schema !== 1)
    throw new VersionsError('schema', `unsupported versions.json schema ${String(d.schema)}`);
  if (!Array.isArray(d.versions) || d.versions.length === 0)
    throw new VersionsError('shape', 'versions.json has no versions');
  if (typeof d.latest?.release !== 'string')
    throw new VersionsError('shape', 'versions.json has no latest release');
  for (const v of d.versions) {
    const ok =
      typeof v?.id === 'string' &&
      (v.type === 'release' || v.type === 'snapshot') &&
      typeof v.releaseTime === 'string' &&
      Number.isInteger(v.javaMajor) &&
      /^[0-9a-f]{40}$/.test(v.jar?.sha1 ?? '') &&
      Number.isInteger(v.jar?.size) &&
      isAllowedHttpsUrl(v.jar?.url ?? '', JAR_HOSTS);
    if (!ok)
      throw new VersionsError('shape', `versions.json has a malformed entry (${String(v?.id)})`);
  }
  if (!d.versions.some((v) => v.id === d.latest?.release)) {
    throw new VersionsError('shape', 'the latest release is not in the version list');
  }
  return d as VersionsFile;
}

export async function loadVersions(
  url: string,
  ctx: Pick<CoreContext, 'fetch'> = {},
): Promise<VersionsFile> {
  const doFetch = ctx.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, { cache: 'no-cache' });
  } catch (err) {
    throw new VersionsError(
      'network',
      `could not load the version list: ${(err as Error).message}`,
    );
  }
  if (!res.ok) throw new VersionsError('network', `versions.json: HTTP ${res.status}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new VersionsError('shape', 'versions.json is not valid JSON');
  }
  return parseVersions(json);
}
