// Autosave of the form while the tab is open, so a trip to the help page (or an accidental
// reload) loses nothing. sessionStorage only: it clears when the tab closes.
// The EULA tick is never saved: consent is given afresh every time.
import { overridesToTextWithoutSecrets } from '@/core';
import { sanitizeAnswers, type Answers } from './questions';

const KEY = 'mcsm.draft.v1';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Draft {
  answers: Partial<Answers>;
  showSnapshots: boolean;
}

const REMEMBER_KEY = 'mcsm.remember.v1';

function localStore(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // storage blocked: "remember" quietly does nothing
  }
}

function defaultStore(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null; // storage blocked (private mode, strict settings): the page still works
  }
}

/** What may be written to the browser: never a map, never passwords or secrets. */
function forStorage(draft: Draft): Draft {
  const answers = { ...draft.answers };
  delete answers.map; // a map is a file on this computer; it is picked again after a reload
  if (answers.extraProperties !== undefined) {
    answers.extraProperties = overridesToTextWithoutSecrets(answers.extraProperties);
  }
  return { ...draft, answers };
}

function saveDraftTo(key: string, draft: Draft, store: Store | null): void {
  try {
    store?.setItem(key, JSON.stringify(forStorage(draft)));
  } catch {
    /* full or blocked: autosave is a convenience, never an error */
  }
}

function loadDraftFrom(key: string, store: Store | null): Draft | null {
  try {
    const raw = store?.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as { answers?: unknown; showSnapshots?: unknown };
    return { answers: sanitizeAnswers(p.answers), showSnapshots: p.showSnapshots === true };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft, store: Store | null = defaultStore()): void {
  saveDraftTo(KEY, draft, store);
}

export function loadDraft(store: Store | null = defaultStore()): Draft | null {
  return loadDraftFrom(KEY, store);
}

export function clearDraft(store: Store | null = defaultStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * "Remember my settings": an opt-in copy in localStorage that outlives the tab. It exists only
 * while the player has the switch on (turning it off deletes it), holds the same answers as the
 * autosave and nothing else: no EULA tick, no map, no passwords.
 */
export function saveRemembered(draft: Draft, store: Store | null = localStore()): void {
  saveDraftTo(REMEMBER_KEY, draft, store);
}

export function loadRemembered(store: Store | null = localStore()): Draft | null {
  return loadDraftFrom(REMEMBER_KEY, store);
}

export function clearRemembered(store: Store | null = localStore()): void {
  try {
    store?.removeItem(REMEMBER_KEY);
  } catch {
    /* ignore */
  }
}
