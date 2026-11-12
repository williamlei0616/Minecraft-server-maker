// Reading a map the player picked, entirely in the browser: find the world's level.dat among
// the files, read it with core's reader, and report what the page needs. Nothing is uploaded.
import {
  LEVEL_DAT_MAX_BYTES,
  MapError,
  isSafeMapFolderName,
  readLevelDat,
  type LevelInfo,
} from '@/core';

/** The biggest zip the browser reads whole (it has to sit in memory). */
export const ZIP_MAX_BYTES = 300 * 1024 * 1024;

export interface MapInfo extends LevelInfo {
  /** The folder the player must copy next to the start file; it becomes level-name. */
  folderName: string;
  source: 'folder' | 'zip';
  /** Where the world was found, when it was not at the top (a zip with one extra folder). */
  insidePath: string | null;
  /** A zip with the map's files at the top: the player makes the folder themselves. */
  zipRoot: boolean;
  /** More than one world was found; the shallowest was used. */
  others: number;
}

export type MapFailure =
  | { reason: 'noLevelDat' | 'notJava' | 'damaged' | 'tooBig' | 'notZip' | 'failed' }
  | { reason: 'zipTooBig'; megabytes: number }
  | { reason: 'badName'; name: string };

export type ReadMapResult = { ok: true; info: MapInfo } | ({ ok: false } & MapFailure);

export interface WorldPath {
  /** Path of level.dat with "/" separators, no leading slash. */
  path: string;
  /** The folder holding it, or null when level.dat is at the very top. */
  folder: string | null;
  depth: number;
}

/**
 * Every level.dat in a list of paths, shallowest first. Mac zips carry a __MACOSX copy of every
 * file; those and "level.dat_old" are not worlds.
 */
export function findWorlds(paths: string[]): WorldPath[] {
  const out: WorldPath[] = [];
  for (const raw of paths) {
    const path = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = path.split('/');
    if (parts[parts.length - 1] !== 'level.dat') continue;
    if (parts.includes('__MACOSX')) continue;
    out.push({
      path,
      folder: parts.length > 1 ? (parts[parts.length - 2] ?? null) : null,
      depth: parts.length,
    });
  }
  return out.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
}

function failureFor(err: unknown): MapFailure {
  if (err instanceof MapError) {
    if (err.code === 'notGzip') return { reason: 'notJava' };
    if (err.code === 'tooBig') return { reason: 'tooBig' };
    return { reason: 'damaged' };
  }
  return { reason: 'failed' };
}

/** Turn the chosen world into a result. `read` fetches the bytes of one file. */
async function fromWorlds(
  worlds: WorldPath[],
  read: (path: string) => Promise<Uint8Array>,
  source: MapInfo['source'],
  fallbackName: string,
  zipRoot: boolean,
  topFolder: string | null,
): Promise<ReadMapResult> {
  const best = worlds[0];
  if (!best) return { ok: false, reason: 'noLevelDat' };
  const folderName = best.folder ?? fallbackName;
  if (!isSafeMapFolderName(folderName)) return { ok: false, reason: 'badName', name: folderName };
  let level: LevelInfo;
  try {
    level = await readLevelDat(await read(best.path));
  } catch (err) {
    return { ok: false, ...failureFor(err) };
  }
  // Found somewhere deeper than "the picked folder itself" (or the zip's top folder)?
  const deeper = best.folder !== null && best.depth > (topFolder === null ? 1 : 2);
  return {
    ok: true,
    info: {
      ...level,
      folderName,
      source,
      insidePath: deeper ? best.path.slice(0, -'/level.dat'.length) : null,
      zipRoot,
      others: worlds.length - 1,
    },
  };
}

/** A folder chosen with the directory picker (each file carries webkitRelativePath). */
export async function readMapFromFolder(files: File[]): Promise<ReadMapResult> {
  const byPath = new Map<string, File>();
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    byPath.set(rel.replace(/\\/g, '/'), f);
  }
  const worlds = findWorlds([...byPath.keys()]);
  const top = worlds[0]?.path.split('/')[0] ?? null;
  return fromWorlds(
    worlds,
    async (path) => {
      const file = byPath.get(path);
      if (!file || file.size > LEVEL_DAT_MAX_BYTES) throw new MapError('tooBig', 'too big');
      return new Uint8Array(await file.arrayBuffer());
    },
    'folder',
    'world',
    false,
    top,
  );
}

/** A .zip of a map. Only level.dat is unpacked. */
export async function readMapFromZip(file: File): Promise<ReadMapResult> {
  if (file.size > ZIP_MAX_BYTES) {
    return { ok: false, reason: 'zipTooBig', megabytes: Math.round(file.size / 1048576) };
  }
  let zip;
  try {
    const { default: JSZip } = await import('jszip');
    zip = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, reason: 'notZip' };
  }
  const paths = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir);
  const worlds = findWorlds(paths);
  const best = worlds[0];
  const zipRoot = best !== undefined && best.folder === null;
  const fallback = file.name.replace(/\.zip$/i, '');
  return fromWorlds(
    worlds,
    async (path) => {
      const entry = zip.file(path);
      if (!entry) throw new MapError('corrupt', 'missing');
      // JSZip keeps the unpacked size of an entry here; a bomb would be refused before unpacking.
      const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize;
      if (typeof size === 'number' && size > LEVEL_DAT_MAX_BYTES) {
        throw new MapError('tooBig', 'too big');
      }
      return entry.async('uint8array');
    },
    'zip',
    fallback,
    zipRoot,
    best?.path.split('/')[0] ?? null,
  );
}
