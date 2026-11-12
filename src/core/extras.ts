// The advanced editor's rules: what a hand-written server.properties line may say.
// The player's edits are kept as OVERRIDES (key -> value, only where they differ from what the
// answers generate), and planProperties() puts them on top. Everything here is checked against
// the chosen version's real profile, so "this version has no such setting" is a fact, not a guess.
import { formatProperties, parseProperties, type PropertyEntry } from './javaProperties.mjs';
import type { VersionProfile } from './types';

export const EXTRA_MAX = 100;
export const EXTRA_VALUE_MAX = 1000;
export const EXTRA_KEY_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export type PropertyKind = 'boolean' | 'integer' | 'text';

/** The kind of a setting, from the version's own default ("true", "25565", anything else). */
export function propertyKind(defaultValue: string): PropertyKind {
  if (defaultValue === 'true' || defaultValue === 'false') return 'boolean';
  if (/^-?\d+$/.test(defaultValue)) return 'integer';
  return 'text';
}

export type IssueCode =
  /** A line that is not `key=value` (editor text only). */
  | 'syntax'
  /** The same key twice (editor text only). */
  | 'duplicate'
  | 'unknownKey'
  /** A key the server randomizes per run; never written. */
  | 'volatile'
  | 'tooLong'
  /** The map owns this key (level-name); the editor cannot change it. */
  | 'locked'
  | 'notBoolean'
  | 'notInteger'
  | 'outOfRange'
  | 'notOneOf'
  // warnings: allowed, but the player is told what it means
  | 'riskOnlineMode'
  | 'riskRcon'
  | 'riskJmx'
  | 'riskManagement'
  | 'riskServerIp'
  | 'riskCompression';

export interface PropertyIssue {
  /** Errors block the download; warnings are only shown. */
  level: 'error' | 'warning';
  code: IssueCode;
  key: string;
  /** 1-based line in the editor text, when the issue came from text. */
  line?: number;
  min?: number;
  max?: number;
  options?: string[];
}

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

/** A few settings whose allowed values are known. Everything else is checked by kind only. */
const ENUMS: Record<string, string[]> = {
  difficulty: ['peaceful', 'easy', 'normal', 'hard', '0', '1', '2', '3'],
  gamemode: ['survival', 'creative', 'adventure', 'spectator', '0', '1', '2', '3'],
  'region-file-compression': ['deflate', 'lz4', 'none'],
};
const RANGES: Record<string, [number, number]> = {
  'op-permission-level': [0, 4],
  'function-permission-level': [1, 4],
  'server-port': [1, 65535],
  'query.port': [1, 65535],
  'rcon.port': [1, 65535],
  'view-distance': [3, 32],
  'simulation-distance': [3, 32],
  'max-world-size': [1, 29999984],
  'max-players': [0, INT_MAX],
  'spawn-protection': [0, INT_MAX],
};

function checkValue(
  key: string,
  value: string,
  kind: PropertyKind,
  line?: number,
): PropertyIssue | null {
  const at = line === undefined ? {} : { line };
  if (value.length > EXTRA_VALUE_MAX) {
    return { level: 'error', code: 'tooLong', key, max: EXTRA_VALUE_MAX, ...at };
  }
  if (kind === 'boolean' && !/^(true|false)$/i.test(value)) {
    return { level: 'error', code: 'notBoolean', key, ...at };
  }
  if (kind === 'integer') {
    if (!/^-?\d+$/.test(value)) return { level: 'error', code: 'notInteger', key, ...at };
    const n = Number(value);
    const [min, max] = RANGES[key] ?? [INT_MIN, INT_MAX];
    if (n < min || n > max) return { level: 'error', code: 'outOfRange', key, min, max, ...at };
  }
  const options = ENUMS[key];
  if (options && !options.includes(value.toLowerCase())) {
    return { level: 'error', code: 'notOneOf', key, options, ...at };
  }
  return null;
}

/** Warnings for settings that open the server to strangers or hand control to a program. */
function risk(key: string, value: string, line?: number): PropertyIssue | null {
  const at = line === undefined ? {} : { line };
  const warn = (code: IssueCode): PropertyIssue => ({ level: 'warning', code, key, ...at });
  const v = value.toLowerCase();
  if (key === 'online-mode' && v === 'false') return warn('riskOnlineMode');
  if (key === 'enable-rcon' && v === 'true') return warn('riskRcon');
  if (key === 'enable-jmx-monitoring' && v === 'true') return warn('riskJmx');
  if (key.startsWith('management-server-')) return warn('riskManagement');
  if (key === 'server-ip' && value !== '') return warn('riskServerIp');
  if (key === 'network-compression-threshold') return warn('riskCompression');
  return null;
}

/** Check overrides (key -> value) against one version. Order follows the profile, then unknown keys. */
export function checkExtraProperties(
  profile: VersionProfile,
  extra: Record<string, string>,
  locked: readonly string[] = [],
): PropertyIssue[] {
  const defs = new Map(profile.properties.map((p) => [p.key, p.default]));
  const volatile = new Set(profile.volatile);
  const known: PropertyIssue[] = [];
  const unknown: PropertyIssue[] = [];
  const order = [...defs.keys()];
  for (const key of Object.keys(extra)) {
    const value = extra[key] ?? '';
    if (locked.includes(key)) {
      known.push({ level: 'error', code: 'locked', key });
    } else if (volatile.has(key)) {
      unknown.push({ level: 'warning', code: 'volatile', key });
    } else if (!defs.has(key)) {
      unknown.push({ level: 'error', code: 'unknownKey', key });
    } else {
      const bad = checkValue(key, value, propertyKind(defs.get(key) ?? ''));
      const warn = risk(key, value);
      if (bad) known.push(bad);
      else if (warn) known.push(warn);
    }
  }
  known.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return [...known, ...unknown];
}

export interface EditorResult {
  /** Keys whose value differs from the generated file (including keys this version lacks). */
  overrides: Record<string, string>;
  /** Everything worth telling the player, with line numbers. */
  issues: PropertyIssue[];
}

/**
 * Read the editor's text. `base` is the file the answers alone would generate. A line that is
 * not `key=value`, or repeats a key, is reported and ignored; a key that was deleted simply goes
 * back to the generated value. Comments and blank lines are fine.
 */
export function parseEditorText(
  text: string,
  profile: VersionProfile,
  base: PropertyEntry[],
  locked: readonly string[] = [],
): EditorResult {
  const baseValue = new Map(base.map((e) => [e.key, e.value]));
  const defs = new Map(profile.properties.map((p) => [p.key, p.default]));
  const volatile = new Set(profile.volatile);
  const issues: PropertyIssue[] = [];
  const seen = new Set<string>();
  const overrides: Record<string, string> = {};

  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.replace(/^[ \t\f]+/, '');
    if (trimmed === '' || trimmed[0] === '#' || trimmed[0] === '!') return;
    let entry: PropertyEntry | undefined;
    try {
      entry =
        /[=:]/.test(trimmed) && !/(^|[^\\])(\\\\)*\\$/.test(trimmed)
          ? parseProperties(trimmed)[0]
          : undefined;
    } catch {
      entry = undefined; // a broken \u escape
    }
    if (!entry || entry.key === '') {
      issues.push({ level: 'error', code: 'syntax', key: trimmed.slice(0, 30), line });
      return;
    }
    const { key, value } = entry;
    if (seen.has(key)) {
      issues.push({ level: 'error', code: 'duplicate', key, line });
      return;
    }
    seen.add(key);
    if (volatile.has(key)) {
      issues.push({ level: 'warning', code: 'volatile', key, line });
      return;
    }
    if (!defs.has(key)) {
      issues.push({ level: 'error', code: 'unknownKey', key, line });
      overrides[key] = value; // kept, so the error stays until the line is removed
      return;
    }
    if (value !== baseValue.get(key)) {
      overrides[key] = value;
      if (locked.includes(key)) {
        issues.push({ level: 'error', code: 'locked', key, line });
        return;
      }
      const bad = checkValue(key, value, propertyKind(defs.get(key) ?? ''), line);
      const warn = risk(key, value, line);
      if (bad) issues.push(bad);
      else if (warn) issues.push(warn);
    }
  });
  return { overrides, issues };
}

/** Overrides as `key=value` lines (escaped like the real file), for saving in the form's answers. */
export function overridesFromText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const e of parseProperties(text)) out[e.key] = e.value;
  } catch {
    /* a broken escape: nothing is read */
  }
  return out;
}

/** Keys that hold a password or secret: never put in a share link or saved in the browser. */
export const isSecretKey = (key: string): boolean => /password|secret/i.test(key);

/** Overrides as `key=value` lines, escaped like the real file. The form keeps them as this text. */
export function overridesToText(overrides: Record<string, string>): string {
  return formatProperties(Object.entries(overrides).map(([key, value]) => ({ key, value })));
}

/** The same text without passwords and secrets (for share links and the browser's autosave). */
export function overridesToTextWithoutSecrets(text: string): string {
  const kept = overridesFromText(text);
  for (const key of Object.keys(kept)) if (isSecretKey(key)) delete kept[key];
  return overridesToText(kept);
}

/**
 * The text the editor shows: a header, every generated line with the edits on top, then any
 * edited key this version lacks (kept so its error stays visible until the line is removed).
 */
export function editorText(base: PropertyEntry[], overrides: Record<string, string>): string {
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(overrides, key);
  const known = new Set(base.map((e) => e.key));
  const entries = base.map((e) => ({
    key: e.key,
    value: has(e.key) ? (overrides[e.key] ?? '') : e.value,
  }));
  for (const key of Object.keys(overrides)) {
    if (!known.has(key)) entries.push({ key, value: overrides[key] ?? '' });
  }
  return `#Minecraft server properties\n${formatProperties(entries)}`;
}

/** Keys the editor may not change because another part of the form owns them. */
export function lockedKeys(config: { map: unknown }): string[] {
  return config.map ? ['level-name'] : [];
}
