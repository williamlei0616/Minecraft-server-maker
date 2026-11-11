// Share link: the answers packed into the URL fragment. No server, no database, nothing stored.
// The payload is small JSON of only the answers that differ from the defaults (the version
// is always included, so a link keeps meaning the same thing when a newer release appears),
// compressed with deflate and written as base64url: #share=v1.<payload>
// Never contains the EULA tick.
import { overridesToTextWithoutSecrets } from '@/core';
import { defaultAnswers, sanitizeAnswers, type Answers } from './questions';

export const SHARE_PREFIX = '#share=';
const FORMAT = 'v1.';
const MAX_TOKEN_CHARS = 8192; // what we accept from the address bar
const MAX_JSON_BYTES = 24576; // what we accept after decompressing (a size bomb stops here)

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Push bytes through a (de)compression stream, refusing to produce more than `maxOut` bytes. */
async function pipe(
  stream: CompressionStream | DecompressionStream,
  input: Uint8Array,
  maxOut: number,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Bad input errors show up when reading; do not also leave these promises unhandled.
  writer.write(input as unknown as BufferSource).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxOut) {
      await reader.cancel();
      throw new Error('payload too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The token that goes after "#share=". */
export async function encodeShare(answers: Answers, latestRelease: string): Promise<string> {
  const defaults = defaultAnswers(latestRelease);
  answers = { ...answers, map: '' }; // a map is never put in a link
  // Passwords and secrets typed into the editor are never put in a link.
  answers = { ...answers, extraProperties: overridesToTextWithoutSecrets(answers.extraProperties) };
  const changed: Partial<Answers> = {};
  for (const key of Object.keys(answers) as (keyof Answers)[]) {
    if (key === 'versionId' || answers[key] !== defaults[key]) changed[key] = answers[key];
  }
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, a: changed }));
  return (
    FORMAT + toBase64Url(await pipe(new CompressionStream('deflate-raw'), json, MAX_JSON_BYTES))
  );
}

/** Answers from a token, or null if it is not a valid share token. Never throws. */
export async function decodeShare(token: string): Promise<Partial<Answers> | null> {
  try {
    if (token.length > MAX_TOKEN_CHARS || !token.startsWith(FORMAT)) return null;
    const bytes = fromBase64Url(token.slice(FORMAT.length));
    if (!bytes) return null;
    const raw = await pipe(new DecompressionStream('deflate-raw'), bytes, MAX_JSON_BYTES);
    const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (typeof parsed !== 'object' || parsed === null || (parsed as { v?: unknown }).v !== 1)
      return null;
    return sanitizeAnswers((parsed as { a?: unknown }).a);
  } catch {
    return null;
  }
}
