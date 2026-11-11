// Custom maps (approach A): the page reads ONE small file from the player's map, level.dat,
// on their own computer. Nothing is uploaded. This module is the reader and the rules:
//  * level.dat is gzip-compressed NBT (Java Edition). We read the map's name and the
//    DataVersion it was last saved in, with hard limits so a hostile file cannot hurt the page.
//  * A server can open a map saved by the same or an OLDER Minecraft (it upgrades it, which
//    cannot be undone), never by a NEWER one. The server's own DataVersion is profile.dataVersion.
//  * The map's folder name becomes level-name, so it must be safe as a folder name everywhere.
import type { VersionProfile } from './types';

export type MapErrorCode = 'notGzip' | 'tooBig' | 'corrupt' | 'noData';

export class MapError extends Error {
  readonly code: MapErrorCode;
  constructor(code: MapErrorCode, message: string) {
    super(message);
    this.name = 'MapError';
    this.code = code;
  }
}

/** level.dat is normally a few KB; a few MB is already unusual. */
export const LEVEL_DAT_MAX_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_NODES = 500_000;

export type NbtValue =
  | number
  | bigint
  | string
  | null // arrays of numbers: skipped, not needed
  | NbtValue[]
  | Map<string, NbtValue>;

/** Decompress gzip, giving up past `maxOut` bytes (a size bomb) or on bad data. */
export async function gunzip(bytes: Uint8Array, maxOut = LEVEL_DAT_MAX_BYTES): Promise<Uint8Array> {
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new MapError('notGzip', 'level.dat is not a compressed Java Edition world file');
  }
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxOut) {
        await reader.cancel();
        throw new MapError('tooBig', 'level.dat is far too large');
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof MapError) throw err;
    throw new MapError('corrupt', 'level.dat is damaged');
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Parse uncompressed NBT: the root compound. Throws MapError('corrupt') on anything odd. */
export function parseNbt(bytes: Uint8Array): Map<string, NbtValue> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder('utf-8');
  let at = 0;
  let nodes = 0;
  const bad = (): never => {
    throw new MapError('corrupt', 'level.dat is damaged');
  };
  const need = (n: number): void => {
    if (n < 0 || at + n > bytes.length) bad();
  };
  const u8 = (): number => {
    need(1);
    return view.getUint8(at++);
  };
  const i32 = (): number => {
    need(4);
    const v = view.getInt32(at);
    at += 4;
    return v;
  };
  const str = (): string => {
    need(2);
    const len = view.getUint16(at);
    at += 2;
    need(len);
    const s = text.decode(bytes.subarray(at, at + len));
    at += len;
    return s;
  };
  const skip = (n: number): void => {
    need(n);
    at += n;
  };

  const payload = (tag: number, depth: number): NbtValue => {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) bad();
    switch (tag) {
      case 1:
        need(1);
        return view.getInt8(at++);
      case 2: {
        need(2);
        const v = view.getInt16(at);
        at += 2;
        return v;
      }
      case 3:
        return i32();
      case 4: {
        need(8);
        const v = view.getBigInt64(at);
        at += 8;
        return v;
      }
      case 5: {
        need(4);
        const v = view.getFloat32(at);
        at += 4;
        return v;
      }
      case 6: {
        need(8);
        const v = view.getFloat64(at);
        at += 8;
        return v;
      }
      case 7: {
        const n = i32();
        skip(n);
        return null;
      }
      case 8:
        return str();
      case 9: {
        const inner = u8();
        const n = i32();
        if (n < 0 || n > MAX_NODES) bad();
        if (inner === 0 && n > 0) bad();
        const list: NbtValue[] = [];
        for (let i = 0; i < n; i++) list.push(payload(inner, depth + 1));
        return list;
      }
      case 10: {
        const map = new Map<string, NbtValue>();
        for (;;) {
          const t = u8();
          if (t === 0) break;
          const name = str();
          map.set(name, payload(t, depth + 1));
        }
        return map;
      }
      case 11: {
        const n = i32();
        skip(n * 4);
        return null;
      }
      case 12: {
        const n = i32();
        skip(n * 8);
        return null;
      }
      default:
        return bad();
    }
  };

  if (u8() !== 10) bad();
  str(); // the root's name, normally empty
  const root = payload(10, 0);
  return root as Map<string, NbtValue>;
}

export interface LevelInfo {
  /** The name shown in the game's world list (LevelName). */
  levelName: string | null;
  /** The world format it was last saved in. Missing before Minecraft 1.9. */
  dataVersion: number | null;
  /** "1.20.1" and the like, when the file says. */
  versionName: string | null;
}

const asString = (v: NbtValue | undefined): string | null => (typeof v === 'string' ? v : null);
const asInt = (v: NbtValue | undefined): number | null =>
  typeof v === 'number' && Number.isInteger(v) ? v : null;

/** Read what the page needs from the bytes of a level.dat file. */
export async function readLevelDat(bytes: Uint8Array): Promise<LevelInfo> {
  const root = parseNbt(await gunzip(bytes));
  const data = root.get('Data');
  const level = data instanceof Map ? data : root;
  const version = level.get('Version');
  const hasAnything = level.has('LevelName') || level.has('DataVersion') || level.has('Version');
  if (!hasAnything) throw new MapError('noData', 'level.dat has no world information');
  return {
    levelName: asString(level.get('LevelName')),
    dataVersion: asInt(level.get('DataVersion')),
    versionName: version instanceof Map ? asString(version.get('Name')) : null,
  };
}

export type MapVerdict = 'ok' | 'older' | 'newer' | 'unknown';

/**
 * Can the chosen server version open this map?
 *  ok      same world format
 *  older   saved by an older Minecraft: it opens, and the server upgrades it for good
 *  newer   saved by a newer Minecraft than the server: it cannot be opened
 *  unknown the profile has no world version yet
 */
export function checkMapCompat(
  mapDataVersion: number | null,
  profile: Pick<VersionProfile, 'dataVersion'>,
): MapVerdict {
  const server = profile.dataVersion;
  if (server === undefined) return 'unknown';
  if (mapDataVersion === null) return 'older'; // no DataVersion at all: older than 1.9
  if (mapDataVersion > server) return 'newer';
  return mapDataVersion === server ? 'ok' : 'older';
}

export const MAP_NAME_MAX = 64;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
/** Folders the server itself uses next to a world. */
const SERVER_FOLDERS = ['libraries', 'logs', 'versions', 'crash-reports', 'config'];

/**
 * Is this usable as the map's folder name (and so as level-name) on Windows, macOS and Linux?
 * No separators, nothing Windows forbids, not empty, not "." or "..", not a name the server
 * already uses for its own folders.
 */
export function isSafeMapFolderName(name: string): boolean {
  return (
    typeof name === 'string' &&
    name.length >= 1 &&
    name.length <= MAP_NAME_MAX &&
    !FORBIDDEN_CHARS.test(name) &&
    name !== '.' &&
    name !== '..' &&
    !/[ .]$/.test(name) &&
    !/^ /.test(name) &&
    !WINDOWS_RESERVED.test(name) &&
    !SERVER_FOLDERS.includes(name.toLowerCase())
  );
}
