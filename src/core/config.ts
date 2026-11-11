// Defaults and validation for what the player chooses. Pure and synchronous: the UI calls
// validate() on every change. Version-specific limits (an option a version lacks) are NOT
// errors here; they come from describeOptions(profile) once a profile is loaded.
import type {
  ServerConfig,
  ValidationDetail,
  ValidationResult,
  VersionEntry,
  VersionsFile,
} from './types';

export const LIMITS = {
  ramGb: [1, 128],
  maxPlayers: [1, 100],
  viewDistance: [3, 32],
  simulationDistance: [3, 32],
  port: [1024, 65535],
  spawnProtection: [0, 64],
} as const;

export const MOTD_MAX_LENGTH = 200;
export const SEED_MAX_LENGTH = 128;
import { EXTRA_KEY_PATTERN, EXTRA_MAX, EXTRA_VALUE_MAX } from './extras';
import { isSafeMapFolderName } from './map';

export const OP_USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
/** Most entries in each player list (the start script looks names up 10 at a time). */
export const LIST_MAX = 50;

const IPV4 = /^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$/;

/** A plain IPv4 or IPv6 address: nothing else may reach a start script. */
export function isIpAddress(text: string): boolean {
  if (text.length > 45) return false;
  const v4 = IPV4.exec(text);
  if (v4) return v4.slice(1).every((part) => Number(part) <= 255);
  if (!/^[0-9A-Fa-f:.]+$/.test(text) || !text.includes(':')) return false;
  try {
    new URL(`http://[${text}]/`); // the URL parser is a strict IPv6 checker
    return true;
  } catch {
    return false;
  }
}

/** Long entries are shortened before they go into a message. */
const shown = (text: string): string => (text.length > 30 ? `${text.slice(0, 30)}…` : text);

const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'] as const;
const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'] as const;

/** The default answers, on the newest release. */
export function defaultConfig(versions: Pick<VersionsFile, 'latest'>): ServerConfig {
  return {
    versionId: versions.latest.release,
    ramGb: 4,
    gui: true,
    difficulty: 'easy',
    gamemode: 'survival',
    hardcore: false,
    commandBlocks: false,
    pvp: true,
    maxPlayers: 20,
    motd: 'A Minecraft Server',
    seed: '',
    viewDistance: 10,
    simulationDistance: 10,
    port: 25565,
    allowFlight: false,
    spawnProtection: 16,
    opUsername: '',
    whitelist: false,
    allowedPlayers: [],
    blockedPlayers: [],
    blockedIps: [],
    extraProperties: {},
    map: null,
    eulaAccepted: false,
  };
}

type Fail = (key: keyof ServerConfig, message: string, detail: ValidationDetail) => void;

export function validate(config: ServerConfig, versions: VersionEntry[]): ValidationResult {
  const errors: Partial<Record<keyof ServerConfig, string>> = {};
  const details: Partial<Record<keyof ServerConfig, ValidationDetail>> = {};
  const fail: Fail = (key, message, detail) => {
    errors[key] = message;
    details[key] = detail;
  };

  if (!versions.some((v) => v.id === config.versionId)) {
    fail('versionId', 'Pick one of the versions in the list.', { code: 'version' });
  }
  if (!(DIFFICULTIES as readonly string[]).includes(config.difficulty)) {
    fail('difficulty', 'Pick one of the difficulty levels in the list.', { code: 'choice' });
  }
  if (!(GAMEMODES as readonly string[]).includes(config.gamemode)) {
    fail('gamemode', 'Pick one of the game modes in the list.', { code: 'choice' });
  }
  for (const key of [
    'gui',
    'whitelist',
    'hardcore',
    'commandBlocks',
    'pvp',
    'allowFlight',
    'eulaAccepted',
  ] as const) {
    if (typeof config[key] !== 'boolean') fail(key, 'Choose on or off.', { code: 'onoff' });
  }
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const [min, max] = LIMITS[key];
    const n = config[key];
    if (!Number.isInteger(n) || n < min || n > max) {
      fail(key, `Type a whole number from ${min} to ${max}.`, { code: 'range', min, max });
    }
  }
  if (typeof config.motd !== 'string' || config.motd.trim() === '') {
    fail('motd', 'Give your server a name, or friends will see a blank.', { code: 'blank' });
  } else if (config.motd.length > MOTD_MAX_LENGTH) {
    fail('motd', `Keep the name under ${MOTD_MAX_LENGTH} characters.`, {
      code: 'tooLong',
      max: MOTD_MAX_LENGTH,
    });
  }
  if (typeof config.seed !== 'string' || config.seed.length > SEED_MAX_LENGTH) {
    fail('seed', `Keep the seed under ${SEED_MAX_LENGTH} characters.`, {
      code: 'tooLong',
      max: SEED_MAX_LENGTH,
    });
  }
  if (
    typeof config.opUsername !== 'string' ||
    (config.opUsername !== '' && !OP_USERNAME_PATTERN.test(config.opUsername))
  ) {
    fail('opUsername', 'Use 3 to 16 letters, numbers or underscores. No spaces.', {
      code: 'username',
    });
  }

  checkLists(config, fail);
  checkExtras(config, fail);
  checkMap(config, fail);

  return Object.keys(errors).length ? { ok: false, errors, details } : { ok: true };
}

/** Validate the allow list, block list and blocked IPs (and how they fit with the owner's name). */
function checkLists(config: ServerConfig, fail: Fail): void {
  const names = (key: 'allowedPlayers' | 'blockedPlayers'): { ok: boolean; lower: string[] } => {
    const list = config[key];
    if (!Array.isArray(list) || list.some((n) => typeof n !== 'string')) {
      fail(key, 'This list is not valid.', { code: 'listName', value: '' });
      return { ok: false, lower: [] };
    }
    if (list.length > LIST_MAX) {
      fail(key, `Keep this list to ${LIST_MAX} names or fewer.`, {
        code: 'listTooMany',
        max: LIST_MAX,
      });
      return { ok: false, lower: [] };
    }
    const bad = list.find((n) => !OP_USERNAME_PATTERN.test(n));
    if (bad !== undefined) {
      fail(
        key,
        `"${shown(bad)}" is not a Minecraft username (3 to 16 letters, numbers or underscores).`,
        { code: 'listName', value: shown(bad) },
      );
      return { ok: false, lower: [] };
    }
    const seen = new Set<string>();
    for (const n of list) {
      const lower = n.toLowerCase();
      if (seen.has(lower)) {
        fail(key, `"${n}" is on this list twice.`, { code: 'listDuplicate', value: n });
        return { ok: false, lower: [] };
      }
      seen.add(lower);
    }
    return { ok: true, lower: [...seen] };
  };

  const allowed = names('allowedPlayers');
  const blocked = names('blockedPlayers');

  if (allowed.ok && blocked.ok) {
    const owner = typeof config.opUsername === 'string' ? config.opUsername.toLowerCase() : '';
    const both = allowed.lower.find((n) => blocked.lower.includes(n));
    if (both !== undefined) {
      fail('blockedPlayers', `"${both}" is on both lists.`, { code: 'listOverlap', value: both });
    } else if (owner !== '' && blocked.lower.includes(owner)) {
      fail('blockedPlayers', 'You cannot block your own username.', {
        code: 'blockOwner',
        value: owner,
      });
    }
  }

  if (
    allowed.ok &&
    config.whitelist === true &&
    allowed.lower.length === 0 &&
    config.opUsername === ''
  ) {
    fail(
      'allowedPlayers',
      'Add at least one name, or you would be locked out of your own server.',
      { code: 'whitelistEmpty' },
    );
  }

  const ips = config.blockedIps;
  if (!Array.isArray(ips) || ips.some((x) => typeof x !== 'string')) {
    fail('blockedIps', 'This list is not valid.', { code: 'ipInvalid', value: '' });
  } else if (ips.length > LIST_MAX) {
    fail('blockedIps', `Keep this list to ${LIST_MAX} addresses or fewer.`, {
      code: 'listTooMany',
      max: LIST_MAX,
    });
  } else {
    const badIp = ips.find((ip) => !isIpAddress(ip));
    if (badIp !== undefined) {
      fail('blockedIps', `"${shown(badIp)}" is not an IP address.`, {
        code: 'ipInvalid',
        value: shown(badIp),
      });
    } else {
      const lower = ips.map((ip) => ip.toLowerCase());
      const dup = lower.find((ip, i) => lower.indexOf(ip) !== i);
      if (dup !== undefined) {
        fail('blockedIps', `"${dup}" is on this list twice.`, {
          code: 'listDuplicate',
          value: dup,
        });
      }
    }
  }
}

/** The editor's overrides, as far as core can tell without a profile (see checkExtraProperties). */
function checkExtras(config: ServerConfig, fail: Fail): void {
  const extra = config.extraProperties;
  if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) {
    fail('extraProperties', 'The extra settings are not valid.', { code: 'extraKey', value: '' });
    return;
  }
  const keys = Object.keys(extra);
  if (keys.length > EXTRA_MAX) {
    fail('extraProperties', `Keep the extra settings to ${EXTRA_MAX} lines or fewer.`, {
      code: 'extraTooMany',
      max: EXTRA_MAX,
    });
    return;
  }
  for (const key of keys) {
    const value = extra[key];
    if (!EXTRA_KEY_PATTERN.test(key)) {
      fail('extraProperties', `"${shown(key)}" is not a usable setting name.`, {
        code: 'extraKey',
        value: shown(key),
      });
      return;
    }
    if (
      typeof value !== 'string' ||
      value.length > EXTRA_VALUE_MAX ||
      // eslint-disable-next-line no-control-regex
      /[\u0000-\u001f]/.test(value)
    ) {
      fail('extraProperties', `The value of "${key}" is not usable.`, {
        code: 'extraValue',
        value: key,
      });
      return;
    }
  }
}

/** The map's folder name has to be a safe folder name everywhere. */
function checkMap(config: ServerConfig, fail: Fail): void {
  const map = config.map;
  if (map === null) return;
  const name = typeof map === 'object' && map !== undefined ? map.folderName : undefined;
  if (typeof name !== 'string' || !isSafeMapFolderName(name)) {
    const text = typeof name === 'string' ? shown(name) : '';
    fail('map', `"${text}" cannot be used as a folder name.`, { code: 'mapName', value: text });
  }
}
