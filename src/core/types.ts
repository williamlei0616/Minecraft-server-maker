// Shared contract between the snapshot job, the core library and the UI.

export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';
export type Gamemode = 'survival' | 'creative' | 'adventure' | 'spectator';

export interface VersionEntry {
  /** "26.3", "1.21.4", "26.4-snapshot-7". Never parse as 1.N.N. */
  id: string;
  type: 'release' | 'snapshot';
  /** ISO timestamp from Mojang's manifest. */
  releaseTime: string;
  jar: { url: string; sha1: string; size: number };
  javaMajor: number;
}

export interface VersionsFile {
  schema: 1;
  generatedAt: string;
  latest: { release: string; snapshot: string };
  /** Newest first, in Mojang's own order. */
  versions: VersionEntry[];
}

export interface ServerConfig {
  versionId: string;
  /** Whole gigabytes for the server, 1-128. */
  ramGb: number;
  gui: boolean;
  difficulty: Difficulty;
  gamemode: Gamemode;
  hardcore: boolean;
  commandBlocks: boolean;
  pvp: boolean;
  /** 1-100 */
  maxPlayers: number;
  motd: string;
  seed: string;
  /** 3-32 */
  viewDistance: number;
  /** 3-32 */
  simulationDistance: number;
  /** 1024-65535 */
  port: number;
  allowFlight: boolean;
  /** 0-64 */
  spawnProtection: number;
  /** '' or /^[A-Za-z0-9_]{3,16}$/ */
  opUsername: string;
  /** true = only the people in `allowedPlayers` (and the owner, and operators) can join. */
  whitelist: boolean;
  /** Minecraft usernames allowed in when `whitelist` is on. At most 50. */
  allowedPlayers: string[];
  /** Minecraft usernames who may never join. At most 50. */
  blockedPlayers: string[];
  /** IP addresses that may never connect. At most 50. */
  blockedIps: string[];
  /**
   * Hand-edited server.properties lines (key -> value) that go on top of everything the
   * answers generate. At most 100 keys. Checked against the version's profile by
   * checkExtraProperties(); keys the version lacks are never written.
   */
  extraProperties: Record<string, string>;
  /**
   * A map the player copies into the server folder by hand (nothing is uploaded).
   * `folderName` becomes level-name; it must pass isSafeMapFolderName().
   */
  map: { folderName: string } | null;
  eulaAccepted: boolean;
}

/** Why a field is wrong, as a stable code the page can translate. */
export type ValidationCode =
  | 'version'
  | 'choice'
  | 'onoff'
  | 'range'
  | 'blank'
  | 'tooLong'
  | 'username'
  /** A line in a player list is not a valid Minecraft username (`value` says which). */
  | 'listName'
  | 'listTooMany'
  | 'listDuplicate'
  /** The same name is on the allow list and the block list. */
  | 'listOverlap'
  /** The owner's own username is on the block list. */
  | 'blockOwner'
  | 'ipInvalid'
  /** "Only people on my list" with nobody on it: the owner would be locked out. */
  | 'whitelistEmpty'
  /** An editor line has an unusable key (`value` says which). */
  | 'extraKey'
  | 'extraValue'
  | 'extraTooMany'
  /** The map's folder name cannot be used as a folder name (`value` says which). */
  | 'mapName';
export interface ValidationDetail {
  code: ValidationCode;
  /** For 'range': the inclusive limits. */
  min?: number;
  max?: number;
  /** For list problems: the entry that is wrong. */
  value?: string;
}

export type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      /** English sentences (for tests, the command-line tool and as a fallback). */
      errors: Partial<Record<keyof ServerConfig, string>>;
      /** The same problems as codes and parameters, for translation. */
      details: Partial<Record<keyof ServerConfig, ValidationDetail>>;
    };

/** Languages the bundle's README can be written in. */
export type BundleLocale = 'en' | 'zh-hant';

/**
 * What one Minecraft version really generates and how it is launched, recorded by
 * running that version's own server jar once (scripts/build-profiles.mjs). Served at
 * `profiles/<id>.json`.
 */
export interface VersionProfile {
  schema: 1;
  id: string;
  /** sha1 of the jar this was recorded from; must equal the versions.json entry. */
  jarSha1: string;
  javaMajor: number;
  /**
   * `world_version` from the jar's version.json: the newest world format this server opens.
   * A map saved with a larger DataVersion is too new for it. Absent only in profiles recorded
   * before this field existed (the profile job fills it in).
   */
  dataVersion?: number;
  launch: {
    /** `java -jar server.jar` works (bundler jar). Our start scripts require true. */
    bundler: boolean;
    /** How to say "no GUI" for this version. */
    nogui: '--nogui' | 'nogui';
    /** Every `--option` the jar's own --help listed. */
    options: string[];
  };
  /** Every server.properties key this version writes, in its order, with real defaults. */
  properties: { key: string; default: string }[];
  /** Keys the server randomizes per run (e.g. management-server-secret); never templated. */
  volatile: string[];
}
