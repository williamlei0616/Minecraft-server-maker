import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  escapeKey,
  escapeValue,
  formatProperties,
  parseProperties,
  unescapeJava,
} from '../../src/core/javaProperties.mjs';

const FIXTURES = new URL('../fixtures/profiles/', import.meta.url);
const realFiles = readdirSync(FIXTURES).filter((f) => f.endsWith('.server.properties'));

describe('against real server.properties written by Minecraft', () => {
  it('has fixtures to test with', () => {
    expect(realFiles.length).toBeGreaterThanOrEqual(4);
  });

  for (const name of realFiles) {
    const text = readFileSync(new URL(name, FIXTURES), 'utf8');
    const rawLines = text.split(/\r?\n/).filter((l) => l !== '' && !l.startsWith('#'));

    it(`${name}: every line survives decode then re-encode unchanged`, () => {
      const entries = parseProperties(text);
      expect(entries).toHaveLength(rawLines.length);
      expect(formatProperties(entries).trimEnd().split('\n')).toEqual(rawLines);
    });
  }

  it('decodes the escaped colon in level-type (1.19+)', () => {
    const entries = parseProperties(
      readFileSync(new URL('26.3.server.properties', FIXTURES), 'utf8'),
    );
    expect(entries.find((e) => e.key === 'level-type')?.value).toBe('minecraft:normal');
  });
});

describe('escaping', () => {
  it('escapes the characters Java escapes in values', () => {
    expect(escapeValue('a=b:c#d!e\\f')).toBe('a\\=b\\:c\\#d\\!e\\\\f');
    expect(escapeValue('line1\nline2\tTab\r\f')).toBe('line1\\nline2\\tTab\\r\\f');
  });

  it('escapes only a LEADING space in values, but every space in keys', () => {
    expect(escapeValue(' a b ')).toBe('\\ a b ');
    expect(escapeKey('a b')).toBe('a\\ b');
  });

  it('writes non-ASCII as uppercase \\uXXXX, per UTF-16 unit', () => {
    expect(escapeValue('é')).toBe('\\u00E9');
    expect(escapeValue('😀')).toBe('\\uD83D\\uDE00');
  });

  it('round-trips arbitrary hostile text', () => {
    const nasty = ['x\nlevel-seed=1\n#', '  lead', 'tab\there', 'ünï😀', '\\\\n', '=:#!', ''];
    for (const v of nasty) {
      const parsed = parseProperties(formatProperties([{ key: 'motd', value: v }]));
      expect(parsed).toEqual([{ key: 'motd', value: v }]);
    }
  });

  it('a hostile value can never create an extra key or comment line', () => {
    const out = formatProperties([{ key: 'motd', value: 'x\nlevel-seed=1\n#evil\r\nop=1' }]);
    expect(out.trimEnd().split('\n')).toHaveLength(1);
    expect(parseProperties(out)).toHaveLength(1);
  });
});

describe('parsing', () => {
  it('skips comments and blanks, handles separators and continuations', () => {
    const text = '#c\n! c2\n\na=1\nb : 2\nc 3\nd=long\\\n   line\ne=\n';
    expect(parseProperties(text)).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
      { key: 'c', value: '3' },
      { key: 'd', value: 'longline' },
      { key: 'e', value: '' },
    ]);
  });

  it('keeps the last value for a repeated key', () => {
    expect(parseProperties('a=1\nb=2\na=3\n')).toEqual([
      { key: 'b', value: '2' },
      { key: 'a', value: '3' },
    ]);
  });

  it('rejects a malformed unicode escape', () => {
    expect(() => unescapeJava('\\u12')).toThrow();
  });
});
