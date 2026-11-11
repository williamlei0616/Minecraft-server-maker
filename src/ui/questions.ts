// The questions: their structure (id, kind, limits, which wizard step) and how answers become
// a server config. All WORDS (titles, help, answer labels, units, placeholders) live in the
// language dictionaries (src/i18n), keyed by the question id.
// Value rules live in core (validate); the min/max here only shape the inputs.
// Question numbers are the position in QUESTIONS, 1-based, and continue across steps.

import { LIST_MAX, overridesFromText, type ServerConfig } from '@/core';
import type { Messages } from '@/i18n';
import { fmt } from '@/i18n/format';
import type { StepId } from './steps';

export type QuestionId = Exclude<keyof ServerConfig, 'eulaAccepted'>;
export type Answers = Record<QuestionId, string>;

interface Base {
  id: QuestionId;
  /** The wizard step this question lives on (never 'review'). */
  step: Exclude<StepId, 'review'>;
}
export type Question = Base &
  (
    | { kind: 'version' }
    /** `opts` are the answer values; their labels are in the dictionary. */
    | { kind: 'choice'; opts: readonly string[] }
    | { kind: 'number'; min: number; max: number }
    | { kind: 'text'; max: number }
    /** Several names or addresses, one per line (commas and spaces work too). */
    | { kind: 'list'; max: number }
    /** The whole server.properties, editable; the answer is the changed lines only. */
    | { kind: 'editor' }
    /** A map folder or zip picked on this computer; the answer is its folder name. */
    | { kind: 'map' }
  );

const YES_NO = ['yes', 'no'] as const;

export const QUESTIONS: readonly Question[] = [
  // ---- Basics ----
  { step: 'basics', id: 'versionId', kind: 'version' },
  { step: 'basics', id: 'ramGb', kind: 'number', min: 1, max: 128 },
  { step: 'basics', id: 'gui', kind: 'choice', opts: YES_NO },
  { step: 'basics', id: 'opUsername', kind: 'text', max: 16 },
  // ---- Gameplay ----
  {
    step: 'gameplay',
    id: 'gamemode',
    kind: 'choice',
    opts: ['survival', 'creative', 'adventure', 'spectator'],
  },
  {
    step: 'gameplay',
    id: 'difficulty',
    kind: 'choice',
    opts: ['peaceful', 'easy', 'normal', 'hard'],
  },
  { step: 'gameplay', id: 'hardcore', kind: 'choice', opts: YES_NO },
  { step: 'gameplay', id: 'pvp', kind: 'choice', opts: YES_NO },
  { step: 'gameplay', id: 'commandBlocks', kind: 'choice', opts: YES_NO },
  { step: 'gameplay', id: 'maxPlayers', kind: 'number', min: 1, max: 100 },
  { step: 'gameplay', id: 'motd', kind: 'text', max: 60 },
  { step: 'gameplay', id: 'seed', kind: 'text', max: 40 },
  { step: 'gameplay', id: 'map', kind: 'map' },
  // ---- Players ----
  { step: 'players', id: 'whitelist', kind: 'choice', opts: ['anyone', 'list'] },
  { step: 'players', id: 'allowedPlayers', kind: 'list', max: LIST_MAX },
  { step: 'players', id: 'blockedPlayers', kind: 'list', max: LIST_MAX },
  { step: 'players', id: 'blockedIps', kind: 'list', max: LIST_MAX },
  // ---- Advanced ----
  { step: 'advanced', id: 'viewDistance', kind: 'number', min: 3, max: 32 },
  { step: 'advanced', id: 'simulationDistance', kind: 'number', min: 3, max: 32 },
  { step: 'advanced', id: 'port', kind: 'number', min: 1024, max: 65535 },
  { step: 'advanced', id: 'allowFlight', kind: 'choice', opts: YES_NO },
  { step: 'advanced', id: 'spawnProtection', kind: 'number', min: 0, max: 64 },
  { step: 'advanced', id: 'extraProperties', kind: 'editor' },
];

export const TOTAL = QUESTIONS.length;
const IDS = new Set<string>(QUESTIONS.map((q) => q.id));
const LIST_IDS = new Set<string>(QUESTIONS.filter((q) => q.kind === 'list').map((q) => q.id));
/** Longest text a list box may hold: 50 IPv6 addresses and their separators. */
const LIST_TEXT_MAX = 3000;
/** Longest text the editor's saved lines may take: 100 lines of up to 1000 characters would be more than a link can hold. */
const EDITOR_TEXT_MAX = 8000;

/** The names or addresses in a list box: split on lines, commas, semicolons and spaces. */
export function parseList(text: string): string[] {
  return text.split(/[\s,;]+/).filter((x) => x !== '');
}

/** 1-based numbers of the questions on a step, in order. */
export function questionNumbers(step: StepId): number[] {
  return QUESTIONS.flatMap((q, i) => (q.step === step ? [i + 1] : []));
}

export function defaultAnswers(latestRelease: string): Answers {
  return {
    versionId: latestRelease,
    gamemode: 'survival',
    difficulty: 'easy',
    hardcore: 'no',
    pvp: 'yes',
    commandBlocks: 'no',
    ramGb: '4',
    gui: 'yes',
    maxPlayers: '20',
    motd: 'A Minecraft Server',
    seed: '',
    opUsername: '',
    whitelist: 'anyone',
    allowedPlayers: '',
    blockedPlayers: '',
    blockedIps: '',
    extraProperties: '',
    map: '',
    viewDistance: '10',
    simulationDistance: '10',
    port: '25565',
    allowFlight: 'no',
    spawnProtection: '16',
  };
}

/**
 * Untrusted data (a share link, saved browser storage) -> only the answers we know, as short
 * strings. Anything else is dropped, and keys we did not list are never copied.
 */
export function sanitizeAnswers(raw: unknown, maxLength = 200): Partial<Answers> {
  const out: Partial<Answers> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const key of Object.keys(raw)) {
    // A map is a file on this computer: it never comes from a link or from saved answers.
    if (!IDS.has(key) || key === 'map') continue;
    const value = (raw as Record<string, unknown>)[key];
    const limit =
      key === 'extraProperties' ? EDITOR_TEXT_MAX : LIST_IDS.has(key) ? LIST_TEXT_MAX : maxLength;
    if (typeof value === 'string' && value.length <= limit) out[key as QuestionId] = value;
  }
  return out;
}

/** An answer as plain words in the page's language, for the review summary. */
export function answerText(q: Question, value: string, m: Messages): string {
  const text = m.questions[q.id];
  if (q.kind === 'choice') return text.options?.[value] ?? value;
  if (q.kind === 'map') return value === '' ? m.review.none : value;
  if (q.kind === 'editor') {
    const n = Object.keys(overridesFromText(value)).length;
    return n === 0
      ? m.review.extraNone
      : n === 1
        ? m.review.extraOne
        : fmt(m.review.extraMany, { n });
  }
  if (q.kind === 'list') {
    const items = parseList(value);
    return items.length === 0 ? m.review.none : items.join(', ');
  }
  if (value.trim() === '') {
    return q.id === 'seed'
      ? m.review.random
      : q.id === 'opUsername'
        ? m.review.notSet
        : m.review.empty;
  }
  if (q.kind === 'number' && text.unit) return `${value} ${text.unit}`;
  return value;
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

/** Sheet answers -> the config object core validates and builds from. */
export function toConfig(a: Answers, eulaAccepted: boolean): ServerConfig {
  const hard = a.hardcore === 'yes';
  return {
    versionId: a.versionId,
    ramGb: num(a.ramGb),
    gui: a.gui === 'yes',
    difficulty: (hard ? 'hard' : a.difficulty) as ServerConfig['difficulty'],
    gamemode: a.gamemode as ServerConfig['gamemode'],
    hardcore: hard,
    commandBlocks: a.commandBlocks === 'yes',
    pvp: a.pvp === 'yes',
    maxPlayers: num(a.maxPlayers),
    motd: a.motd,
    seed: a.seed,
    viewDistance: num(a.viewDistance),
    simulationDistance: num(a.simulationDistance),
    port: num(a.port),
    allowFlight: a.allowFlight === 'yes',
    spawnProtection: num(a.spawnProtection),
    opUsername: a.opUsername,
    whitelist: a.whitelist === 'list',
    // With "anyone" the allow list is not used, but what was typed stays in the box.
    allowedPlayers: a.whitelist === 'list' ? parseList(a.allowedPlayers) : [],
    blockedPlayers: parseList(a.blockedPlayers),
    blockedIps: parseList(a.blockedIps),
    extraProperties: overridesFromText(a.extraProperties),
    map: a.map === '' ? null : { folderName: a.map },
    eulaAccepted,
  };
}
