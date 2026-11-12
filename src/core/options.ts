// Which player-facing option writes which server.properties key, and what happens on
// versions where that key no longer exists. The per-version truth comes from the profile,
// never from this file: if a profile lacks the key, the option is unavailable there.
import type { ServerConfig, VersionProfile } from './types';

export type OptionId =
  | 'difficulty'
  | 'gamemode'
  | 'hardcore'
  | 'commandBlocks'
  | 'pvp'
  | 'maxPlayers'
  | 'motd'
  | 'seed'
  | 'viewDistance'
  | 'simulationDistance'
  | 'port'
  | 'allowFlight'
  | 'spawnProtection'
  | 'whitelist';

export interface OptionDef {
  id: OptionId;
  /** The server.properties key this option writes. */
  key: string;
  encode: (config: ServerConfig) => string;
  /**
   * Set when Mojang later moved this setting from server.properties into a world game
   * rule (1.21.9). On those versions the option is unavailable here and the game rule's
   * own default applies (e.g. `command_blocks_work` is true by default).
   */
  gameRule?: string;
}

const bool = (v: boolean): string => (v ? 'true' : 'false');

export const OPTIONS: readonly OptionDef[] = [
  { id: 'difficulty', key: 'difficulty', encode: (c) => c.difficulty },
  { id: 'gamemode', key: 'gamemode', encode: (c) => c.gamemode },
  { id: 'hardcore', key: 'hardcore', encode: (c) => bool(c.hardcore) },
  {
    id: 'commandBlocks',
    key: 'enable-command-block',
    encode: (c) => bool(c.commandBlocks),
    gameRule: 'command_blocks_work',
  },
  { id: 'pvp', key: 'pvp', encode: (c) => bool(c.pvp), gameRule: 'pvp' },
  { id: 'maxPlayers', key: 'max-players', encode: (c) => String(c.maxPlayers) },
  { id: 'motd', key: 'motd', encode: (c) => c.motd },
  { id: 'seed', key: 'level-seed', encode: (c) => c.seed },
  { id: 'viewDistance', key: 'view-distance', encode: (c) => String(c.viewDistance) },
  {
    id: 'simulationDistance',
    key: 'simulation-distance',
    encode: (c) => String(c.simulationDistance),
  },
  { id: 'port', key: 'server-port', encode: (c) => String(c.port) },
  { id: 'allowFlight', key: 'allow-flight', encode: (c) => bool(c.allowFlight) },
  { id: 'spawnProtection', key: 'spawn-protection', encode: (c) => String(c.spawnProtection) },
  // Always written (never left at the version's default): 26.3 changed the default to true, which
  // would lock a new owner out of their own server.
  { id: 'whitelist', key: 'white-list', encode: (c) => bool(c.whitelist) },
];

export type OptionStatus =
  | { available: true }
  | { available: false; reason: 'game-rule'; gameRule: string }
  | { available: false; reason: 'not-in-version' };

/** What the chosen version supports, so the UI can disable or explain an option. */
export function describeOptions(profile: VersionProfile): Record<OptionId, OptionStatus> {
  const keys = new Set(profile.properties.map((p) => p.key));
  const out = {} as Record<OptionId, OptionStatus>;
  for (const def of OPTIONS) {
    if (keys.has(def.key)) out[def.id] = { available: true };
    else if (def.gameRule)
      out[def.id] = { available: false, reason: 'game-rule', gameRule: def.gameRule };
    else out[def.id] = { available: false, reason: 'not-in-version' };
  }
  return out;
}

/** The version's own default for an option, as text ('' if the key does not exist there). */
export function defaultFor(profile: VersionProfile, id: OptionId): string | undefined {
  const def = OPTIONS.find((o) => o.id === id);
  return def ? profile.properties.find((p) => p.key === def.key)?.default : undefined;
}
