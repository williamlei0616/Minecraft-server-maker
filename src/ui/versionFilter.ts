// Pure rules for the version search box: no React, no DOM.
// Versions are matched on their id as TEXT ("26.3", "1.21.4", "26.4-snapshot-7"). They are
// never parsed as numbers: the current release is 26.3, not 1.x.

export interface VersionOption {
  id: string;
  /** What the list shows, e.g. "26.4-snapshot-7 (test)". */
  label: string;
  newest: boolean;
  snapshot: boolean;
}

const NEWEST_WORDS = ['newest', 'latest', 'new'];

/**
 * Options that match what the player typed, best matches first.
 * An empty search shows everything in the given order (newest first).
 * Order of matches: exact id, ids that start with the text, then ids that contain it.
 */
export function filterVersions(options: readonly VersionOption[], query: string): VersionOption[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...options];
  if (NEWEST_WORDS.includes(q)) return options.filter((o) => o.newest);

  const id = (o: VersionOption) => o.id.toLowerCase();
  const exact = options.filter((o) => id(o) === q);
  const prefix = options.filter((o) => id(o).startsWith(q) && id(o) !== q);
  const contains = options.filter((o) => id(o).includes(q) && !id(o).startsWith(q));
  return [...exact, ...prefix, ...contains];
}

/**
 * The version a typed text stands for, if it is unambiguous: an exact id, or the only match.
 * Used when the player leaves the box or presses Enter without moving the highlight.
 */
export function pickFromText(
  options: readonly VersionOption[],
  text: string,
): VersionOption | null {
  const q = text.trim().toLowerCase();
  if (q === '') return null;
  const exact = options.find((o) => o.id.toLowerCase() === q);
  if (exact) return exact;
  const matches = filterVersions(options, text);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}
