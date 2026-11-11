// The help page's "which Java does each Minecraft version need" table, built from versions.json
// so it can never be out of date. Versions are ordered newest first in that file, and are
// grouped by the Java they need: 25 -> 26.1 to 26.3, 21 -> 1.20.5 to 1.21.11, and so on.
import type { VersionEntry } from '@/core';

export interface JavaRow {
  java: number;
  /** Oldest and newest release that needs this Java. */
  from: string;
  to: string;
}

export function javaRanges(versions: readonly VersionEntry[]): JavaRow[] {
  const rows: JavaRow[] = [];
  // Releases only (test versions change often), newest first as listed.
  for (const v of versions) {
    if (v.type !== 'release') continue;
    const last = rows[rows.length - 1];
    if (last && last.java === v.javaMajor) last.from = v.id;
    else rows.push({ java: v.javaMajor, from: v.id, to: v.id });
  }
  // Newest Java first.
  return rows.sort((a, b) => b.java - a.java);
}
