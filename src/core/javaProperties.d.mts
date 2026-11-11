export interface PropertyEntry {
  key: string;
  value: string;
}
export function unescapeJava(s: string): string;
export function parseProperties(text: string): PropertyEntry[];
export function escapeValue(s: string): string;
export function escapeKey(s: string): string;
export function formatProperties(entries: PropertyEntry[]): string;
