// Java .properties parsing and escaping, matching what Minecraft's server writes
// (java.util.Properties.store). Shared by the profile extractor (scripts/) and the
// core library (src/core). Plain .mjs with a .d.mts beside it so both can import it.
// Verified against real server.properties files from 1.18.2, 1.21.11 and 26.3 (tests).

const SIMPLE_ESCAPES = { t: '\t', n: '\n', r: '\r', f: '\f' };

/** Decode backslash escapes (\t \n \r \f \uXXXX and \x for any other x). */
export function unescapeJava(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    i++;
    const n = s[i];
    if (n === undefined) break; // dangling backslash at end of input
    if (n === 'u') {
      const hex = s.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('malformed \\u escape in properties');
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else {
      out += Object.prototype.hasOwnProperty.call(SIMPLE_ESCAPES, n) ? SIMPLE_ESCAPES[n] : n;
    }
  }
  return out;
}

function endsWithOddBackslashes(line) {
  let n = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i--) n++;
  return n % 2 === 1;
}

const WS = ' \t\f';

/**
 * Parse properties text into ordered entries. Comments (# or !) and blank lines are
 * skipped; a trailing odd backslash continues onto the next line. A repeated key keeps
 * its last value, like Java.
 * @param {string} text
 * @returns {{key:string, value:string}[]}
 */
export function parseProperties(text) {
  const lines = text.split(/\r\n|\r|\n/);
  /** @type {Map<string,string>} */
  const map = new Map();
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/^[ \t\f]+/, '');
    if (line === '' || line[0] === '#' || line[0] === '!') continue;
    while (endsWithOddBackslashes(line) && i + 1 < lines.length) {
      i++;
      line = line.slice(0, -1) + lines[i].replace(/^[ \t\f]+/, '');
    }
    let k = 0;
    while (k < line.length) {
      const c = line[k];
      if (c === '\\') {
        k += 2;
        continue;
      }
      if (c === '=' || c === ':' || WS.includes(c)) break;
      k++;
    }
    let v = k;
    while (v < line.length && WS.includes(line[v])) v++;
    if (v < line.length && (line[v] === '=' || line[v] === ':')) {
      v++;
      while (v < line.length && WS.includes(line[v])) v++;
    }
    const key = unescapeJava(line.slice(0, k));
    map.delete(key); // re-insert so a repeated key moves to its last position
    map.set(key, unescapeJava(line.slice(v)));
  }
  return [...map].map(([key, value]) => ({ key, value }));
}

function escapeText(s, isKey) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = s.charCodeAt(i);
    switch (c) {
      case '\\':
        out += '\\\\';
        break;
      case '\t':
        out += '\\t';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\r':
        out += '\\r';
        break;
      case '\f':
        out += '\\f';
        break;
      case ' ':
        out += isKey || i === 0 ? '\\ ' : ' ';
        break;
      case '=':
      case ':':
      case '#':
      case '!':
        out += '\\' + c;
        break;
      default:
        out +=
          code < 0x20 || code > 0x7e ? '\\u' + code.toString(16).toUpperCase().padStart(4, '0') : c;
    }
  }
  return out;
}

/** Escape a value the way java.util.Properties.store does. */
export function escapeValue(s) {
  return escapeText(s, false);
}

/** Escape a key the way java.util.Properties.store does. */
export function escapeKey(s) {
  return escapeText(s, true);
}

/** Serialize entries as `key=value` lines, escaped, each ending with a newline. */
export function formatProperties(entries) {
  return entries.map((e) => `${escapeKey(e.key)}=${escapeValue(e.value)}\n`).join('');
}
