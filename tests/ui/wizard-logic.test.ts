import { describe, expect, it } from 'vitest';
import {
  QUESTIONS,
  TOTAL,
  defaultAnswers,
  questionNumbers,
  sanitizeAnswers,
  type Answers,
} from '@/ui/questions';
import { decodeShare, encodeShare } from '@/ui/share';
import { STEPS, nextStep, prevStep, stepFromHash } from '@/ui/steps';
import { clearDraft, loadDraft, saveDraft } from '@/ui/storage';

const LATEST = '26.3';
const fake = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
};

describe('steps', () => {
  it('has Basics, Gameplay, Players, Advanced, then Review last', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['basics', 'gameplay', 'players', 'advanced', 'review']);
  });

  it('every question lives on exactly one step and numbers continue across steps', () => {
    const all = STEPS.flatMap((s) => questionNumbers(s.id));
    expect(all).toEqual(Array.from({ length: TOTAL }, (_, i) => i + 1));
    expect(questionNumbers('review')).toEqual([]);
  });

  it('Basics is short: the must-have answers only', () => {
    const ids = questionNumbers('basics').map((n) => QUESTIONS[n - 1]!.id);
    expect(ids).toEqual(['versionId', 'ramGb', 'gui', 'opUsername']);
  });

  it('reads the step from the hash and ignores everything else, including share links', () => {
    expect(stepFromHash('#gameplay')).toBe('gameplay');
    expect(stepFromHash('review')).toBe('review');
    expect(stepFromHash('#share=v1.abc')).toBeNull();
    expect(stepFromHash('#q3')).toBeNull();
    expect(stepFromHash('')).toBeNull();
  });

  it('knows its neighbours', () => {
    expect(prevStep('basics')).toBeUndefined();
    expect(nextStep('basics')?.id).toBe('gameplay');
    expect(nextStep('advanced')?.id).toBe('review');
    expect(nextStep('review')).toBeUndefined();
  });
});

describe('sanitizeAnswers', () => {
  it('keeps known answers as strings and drops everything else', () => {
    const out = sanitizeAnswers({
      gamemode: 'creative',
      port: 25566,
      evil: 'x',
      constructor: 'y',
      __proto__: { polluted: true },
    });
    expect(out).toEqual({ gamemode: 'creative' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('drops very long values and non-objects', () => {
    expect(sanitizeAnswers({ motd: 'x'.repeat(201) })).toEqual({});
    expect(sanitizeAnswers('nope')).toEqual({});
    expect(sanitizeAnswers(null)).toEqual({});
    expect(sanitizeAnswers([1, 2])).toEqual({});
  });
});

describe('share link', () => {
  const custom = (): Answers => ({
    ...defaultAnswers(LATEST),
    versionId: '1.21.4',
    gamemode: 'creative',
    motd: 'Our world ✨',
    opUsername: 'Steve_01',
    ramGb: '8',
  });

  it('round-trips every answer, including unicode', async () => {
    const token = await encodeShare(custom(), LATEST);
    const back = await decodeShare(token);
    expect({ ...defaultAnswers(LATEST), ...back }).toEqual(custom());
  });

  it('is small and URL-safe', async () => {
    const token = await encodeShare(custom(), LATEST);
    expect(token.startsWith('v1.')).toBe(true);
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(token.length).toBeLessThan(200);
  });

  it('always carries the version, so a link keeps its meaning when a newer release appears', async () => {
    const token = await encodeShare(defaultAnswers(LATEST), LATEST);
    expect((await decodeShare(token))?.versionId).toBe(LATEST);
  });

  it('only stores what differs from the defaults', async () => {
    const plain = await encodeShare(defaultAnswers(LATEST), LATEST);
    const fancy = await encodeShare(custom(), LATEST);
    expect(plain.length).toBeLessThan(fancy.length);
    expect(Object.keys((await decodeShare(plain))!)).toEqual(['versionId']);
  });

  it('never carries anything about the EULA', async () => {
    const token = await encodeShare(custom(), LATEST);
    const bytes = Uint8Array.from(
      atob(
        token.slice(3).replace(/-/g, '+').replace(/_/g, '/') +
          '='.repeat((4 - (token.slice(3).length % 4)) % 4),
      ),
      (c) => c.charCodeAt(0),
    );
    expect(JSON.stringify([...bytes])).not.toContain('eula');
    expect(Object.keys((await decodeShare(token))!)).not.toContain('eulaAccepted');
  });

  it('rejects garbage without throwing', async () => {
    for (const bad of [
      '',
      'v1.',
      'v2.abc',
      'abc',
      'v1.!!!',
      'v1.AAAA',
      'v1.' + 'A'.repeat(5000),
      '../../etc/passwd',
    ]) {
      expect(await decodeShare(bad), bad.slice(0, 20)).toBeNull();
    }
  });

  it('ignores hostile content inside a valid envelope', async () => {
    const evil = JSON.stringify({
      v: 1,
      a: {
        gamemode: 'creative',
        __proto__: { x: 1 },
        eulaAccepted: 'true',
        script: '<script>',
        motd: 'y'.repeat(500),
      },
    });
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    void w.write(new TextEncoder().encode(evil) as unknown as BufferSource);
    void w.close();
    const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    let bin = '';
    for (const b of compressed) bin += String.fromCharCode(b);
    const token = 'v1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await decodeShare(token)).toEqual({ gamemode: 'creative' });
  });

  it('refuses a payload that inflates past the size limit', async () => {
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    void w.write(
      new TextEncoder().encode(
        '{"v":1,"a":{"motd":"' + 'a'.repeat(200_000) + '"}}',
      ) as unknown as BufferSource,
    );
    void w.close();
    const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    expect(compressed.length).toBeLessThan(1000); // a classic small-in, big-out payload
    let bin = '';
    for (const b of compressed) bin += String.fromCharCode(b);
    expect(
      await decodeShare(
        'v1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      ),
    ).toBeNull();
  });
});

describe('draft autosave', () => {
  it('saves and restores answers and the test-versions switch', () => {
    const s = fake();
    saveDraft({ answers: { gamemode: 'creative', port: '25570' }, showSnapshots: true }, s);
    expect(loadDraft(s)).toEqual({
      answers: { gamemode: 'creative', port: '25570' },
      showSnapshots: true,
    });
  });

  it('survives corrupt, hostile or missing storage', () => {
    const s = fake();
    expect(loadDraft(s)).toBeNull();
    s.setItem('mcsm.draft.v1', '{not json');
    expect(loadDraft(s)).toBeNull();
    s.setItem(
      'mcsm.draft.v1',
      JSON.stringify({ answers: { evil: 'x', gamemode: 'creative' }, showSnapshots: 'yes' }),
    );
    expect(loadDraft(s)).toEqual({ answers: { gamemode: 'creative' }, showSnapshots: false });
    expect(loadDraft(null)).toBeNull();
    expect(() => saveDraft({ answers: {}, showSnapshots: false }, null)).not.toThrow();
  });

  it('never stores the EULA tick', () => {
    const s = fake();
    saveDraft({ answers: { gamemode: 'creative' }, showSnapshots: false }, s);
    expect(s.m.get('mcsm.draft.v1')).not.toMatch(/eula/i);
  });

  it('can be cleared', () => {
    const s = fake();
    saveDraft({ answers: { gamemode: 'creative' }, showSnapshots: false }, s);
    clearDraft(s);
    expect(loadDraft(s)).toBeNull();
  });
});
