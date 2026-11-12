// The wizard's steps. The step lives in the URL hash
// (#basics, #gameplay, ...) so the Back button and bookmarks work. Titles and intros are in
// the language dictionaries (src/i18n), keyed by the step id.

export type StepId = 'basics' | 'gameplay' | 'players' | 'advanced' | 'review';

export interface StepDef {
  id: StepId;
}

export const STEPS: readonly StepDef[] = [
  { id: 'basics' },
  { id: 'gameplay' },
  { id: 'players' },
  { id: 'advanced' },
  { id: 'review' },
];

export const stepIndex = (id: StepId): number => STEPS.findIndex((s) => s.id === id);
export const nextStep = (id: StepId): StepDef | undefined => STEPS[stepIndex(id) + 1];
export const prevStep = (id: StepId): StepDef | undefined => STEPS[stepIndex(id) - 1];

/** "#gameplay" -> "gameplay". Anything that is not a step (including "#share=...") -> null. */
export function stepFromHash(hash: string): StepId | null {
  const id = hash.replace(/^#/, '');
  return STEPS.find((s) => s.id === id)?.id ?? null;
}
