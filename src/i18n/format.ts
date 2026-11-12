// Pure text helpers for translated strings. No React, so they can be tested directly.

export type Params = Record<string, string | number>;

/** Fill {name} placeholders. A placeholder with no value is left visible, so a bug shows. */
export function fmt(template: string, params: Params = {}): string {
  return template.replace(/\{([A-Za-z]+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

export type Piece = { kind: 'text'; text: string } | { kind: 'tag'; name: string; text: string };

/**
 * Split a string with simple tags into pieces: "Open <adoptium>this page</adoptium>, then <b>run</b> it."
 * Tags do not nest and have lower-case names. Text with no tags comes back as one piece.
 */
export function parseTags(template: string): Piece[] {
  const out: Piece[] = [];
  const tag = /<([a-z]+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  for (let m = tag.exec(template); m !== null; m = tag.exec(template)) {
    if (m.index > last) out.push({ kind: 'text', text: template.slice(last, m.index) });
    out.push({ kind: 'tag', name: m[1] as string, text: m[2] as string });
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push({ kind: 'text', text: template.slice(last) });
  return out;
}

/** The {placeholders} used in a string, sorted and de-duplicated. */
export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1] as string))].sort();
}

/** The tag names used in a string, sorted and de-duplicated. */
export function tagsOf(template: string): string[] {
  return [...new Set([...template.matchAll(/<([a-z]+)>/g)].map((m) => m[1] as string))].sort();
}
