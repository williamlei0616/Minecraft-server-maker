// Turns a version profile plus the player's choices into that version's server.properties.
// We start from the version's REAL generated defaults (every key, in the server's own
// order), change only what the player chose, and leave randomized keys out so the server
// makes its own. Keys a version doesn't have are never written.
import { formatProperties, type PropertyEntry } from './javaProperties.mjs';
import { OPTIONS, type OptionId } from './options';
import type { ServerConfig, VersionProfile } from './types';

export interface PropertiesPlan {
  entries: PropertyEntry[];
  /** Options this version cannot express in server.properties (see describeOptions). */
  unavailable: OptionId[];
  /** Keys set from the access choice rather than from a question (see below). */
  pinned: string[];
  /** Keys the player's own edits changed (these win over the questions). */
  overridden: string[];
  /** Edited keys that were left out: this version lacks them, or the server randomizes them. */
  ignored: string[];
}

export function planProperties(profile: VersionProfile, config: ServerConfig): PropertiesPlan {
  const values = new Map(profile.properties.map((p) => [p.key, p.default]));
  const volatile = new Set(profile.volatile);
  const unavailable: OptionId[] = [];

  for (const def of OPTIONS) {
    if (values.has(def.key) && !volatile.has(def.key)) values.set(def.key, def.encode(config));
    else unavailable.push(def.id);
  }
  // "Only people on my list" also kicks listed-off players when the list changes, so it is not
  // half-applied; "anyone" leaves that setting at the version's default.
  const pinned: string[] = [];
  if (config.whitelist && values.has('enforce-whitelist')) {
    values.set('enforce-whitelist', 'true');
    pinned.push('enforce-whitelist');
  }
  // The player's own edits go last, so they win over every question and over the choice above.
  const overridden: string[] = [];
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(config.extraProperties ?? {})) {
    if (values.has(key) && !volatile.has(key)) {
      values.set(key, value);
      overridden.push(key);
    } else ignored.push(key);
  }
  // A map's folder name is the world's name. It wins over everything, so the world the player
  // copied in is the one the server opens.
  if (config.map && values.has('level-name')) {
    values.set('level-name', config.map.folderName);
  }
  return {
    entries: [...values].map(([key, value]) => ({ key, value })),
    unavailable,
    pinned,
    overridden,
    ignored,
  };
}

/** The file contents. No timestamp, so the same choices always give the same bytes. */
export function renderServerProperties(plan: PropertiesPlan): string {
  return `#Minecraft server properties\n${formatProperties(plan.entries)}`;
}
