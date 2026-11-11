// Which questions the chosen Minecraft version cannot take, and why.
// The truth comes from the version's profile (what that version's own server really
// generates), via core's describeOptions(). Nothing here hard-codes a version number.
// The sentence shown to the player is in the dictionary (notes.gameRule / notes.notInVersion).
import { describeOptions, type OptionStatus, type VersionProfile } from '@/core';
import type { Messages } from '@/i18n';
import type { QuestionId } from './questions';

export interface Unavailable {
  reason: 'game-rule' | 'not-in-version';
}

/** Questions this version cannot take, by question id. Empty until the profile has loaded. */
export function unavailableQuestions(
  profile: VersionProfile | null,
): Partial<Record<QuestionId, Unavailable>> {
  if (!profile) return {};
  const out: Partial<Record<QuestionId, Unavailable>> = {};
  const status = describeOptions(profile) as Record<string, OptionStatus>;
  for (const [id, st] of Object.entries(status)) {
    if (st.available) continue;
    out[id as QuestionId] = { reason: st.reason };
  }
  return out;
}

/** The plain-language sentence for an unavailable question, in the page's language. */
export function unavailableNote(u: Unavailable, m: Messages): string {
  return u.reason === 'game-rule' ? m.notes.gameRule : m.notes.notInVersion;
}
