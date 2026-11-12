import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProperties } from '../../src/core/javaProperties.mjs';
import { OPTIONS, defaultFor, describeOptions } from '../../src/core/options';
import { planProperties, renderServerProperties } from '../../src/core/properties';
import type { ServerConfig, VersionProfile } from '../../src/core/types';

const PROFILES = new URL('../../public/profiles/', import.meta.url);
const load = (id: string): VersionProfile =>
  JSON.parse(readFileSync(new URL(`${id}.json`, PROFILES), 'utf8'));
const allIds = readdirSync(PROFILES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5));

const config = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  versionId: 'x',
  ramGb: 4,
  gui: true,
  difficulty: 'easy',
  gamemode: 'survival',
  hardcore: false,
  commandBlocks: false,
  pvp: true,
  maxPlayers: 20,
  motd: 'A Minecraft Server',
  seed: '',
  viewDistance: 10,
  simulationDistance: 10,
  port: 25565,
  allowFlight: false,
  spawnProtection: 16,
  opUsername: '',
  whitelist: false,
  allowedPlayers: [],
  blockedPlayers: [],
  blockedIps: [],
  extraProperties: {},
  map: null,
  eulaAccepted: true,
  ...over,
});

const rendered = (id: string, over: Partial<ServerConfig> = {}) => {
  const profile = load(id);
  const plan = planProperties(profile, config(over));
  const text = renderServerProperties(plan);
  return { profile, plan, text, map: new Map(parseProperties(text).map((e) => [e.key, e.value])) };
};

describe('every committed profile', () => {
  it('exists for the versions we support', () => {
    expect(allIds).toContain('1.18.2');
    expect(allIds).toContain('1.21.11');
    expect(allIds).toContain('26.3');
  });

  for (const id of allIds) {
    it(`${id}: renders every version key once, with no random keys, parseable back`, () => {
      const { profile, plan, text, map } = rendered(id);
      expect(plan.entries.map((e) => e.key)).toEqual(profile.properties.map((p) => p.key));
      for (const k of profile.volatile) expect(map.has(k)).toBe(false);
      expect(map.size).toBe(profile.properties.length);
      expect(text.startsWith('#Minecraft server properties\n')).toBe(true);
      // the only comment is the header: no timestamp, so identical choices give identical bytes
      expect(text.split('\n').filter((l) => l.startsWith('#'))).toEqual([
        '#Minecraft server properties',
      ]);
      // never writes a key the version does not have
      const own = new Set(profile.properties.map((p) => p.key));
      for (const k of map.keys()) expect(own.has(k)).toBe(true);
    });
  }
});

describe('1.18.2 (all options are server.properties keys)', () => {
  it('applies the player choices to the right keys', () => {
    const { map, plan } = rendered('1.18.2', {
      difficulty: 'hard',
      gamemode: 'creative',
      commandBlocks: true,
      pvp: false,
      maxPlayers: 8,
      motd: 'Hi: there',
      seed: '12345',
      port: 25570,
    });
    expect(map.get('difficulty')).toBe('hard');
    expect(map.get('gamemode')).toBe('creative');
    expect(map.get('enable-command-block')).toBe('true');
    expect(map.get('pvp')).toBe('false');
    expect(map.get('max-players')).toBe('8');
    expect(map.get('motd')).toBe('Hi: there');
    expect(map.get('level-seed')).toBe('12345');
    expect(map.get('server-port')).toBe('25570');
    expect(plan.unavailable).toEqual([]);
  });

  it('keeps everything the player did not touch at the version default', () => {
    const { map, profile } = rendered('1.18.2');
    expect(map.get('level-type')).toBe('default');
    expect(map.get('online-mode')).toBe(
      profile.properties.find((p) => p.key === 'online-mode')?.default,
    );
  });
});

describe('1.21.11 (command blocks and pvp became game rules in 1.21.9)', () => {
  it('reports them unavailable and writes neither key', () => {
    const { plan, map, profile } = rendered('1.21.11', { commandBlocks: true, pvp: false });
    expect(plan.unavailable).toEqual(['commandBlocks', 'pvp']);
    expect(map.has('enable-command-block')).toBe(false);
    expect(map.has('pvp')).toBe(false);
    expect(describeOptions(profile).commandBlocks).toEqual({
      available: false,
      reason: 'game-rule',
      gameRule: 'command_blocks_work',
    });
    expect(describeOptions(profile).difficulty).toEqual({ available: true });
  });
});

describe('26.3 (new defaults)', () => {
  it('writes white-list from the choice even though the version defaults to true', () => {
    const off = rendered('26.3');
    expect(off.profile.properties.find((p) => p.key === 'white-list')?.default).toBe('true');
    expect(off.map.get('white-list')).toBe('false');
    expect(off.plan.pinned).toEqual([]);
    const on = rendered('26.3', { whitelist: true, opUsername: 'Notch' });
    expect(on.map.get('white-list')).toBe('true');
    expect(on.map.get('enforce-whitelist')).toBe('true');
    expect(on.plan.pinned).toEqual(['enforce-whitelist']);
  });

  it('keeps enforce-whitelist at the version default when anyone may join', () => {
    const { map, profile } = rendered('1.18.2');
    expect(map.get('enforce-whitelist')).toBe(
      profile.properties.find((p) => p.key === 'enforce-whitelist')?.default,
    );
  });

  it('never templates the random management secret', () => {
    const { profile, text } = rendered('26.3');
    expect(profile.volatile).toContain('management-server-secret');
    expect(text).not.toContain('management-server-secret');
  });

  it('writes the colon in level-type escaped, exactly as the server does', () => {
    const { text } = rendered('26.3');
    expect(text).toContain('level-type=minecraft\\:normal\n');
  });
});

describe('hostile values cannot add keys', () => {
  it('a motd with newlines and "key=value" stays one key', () => {
    const { text, map, profile } = rendered('26.3', {
      motd: 'x\nenable-jmx-monitoring=true\n#\r\nop=1',
      seed: 'a\nlevel-name=evil',
    });
    expect(map.size).toBe(profile.properties.length);
    expect(map.get('motd')).toBe('x\nenable-jmx-monitoring=true\n#\r\nop=1');
    expect(text.trimEnd().split('\n')).toHaveLength(profile.properties.length + 1); // + header
  });
});

describe('option defaults come from the version', () => {
  it('reads real per-version defaults', () => {
    expect(defaultFor(load('26.3'), 'viewDistance')).toBe('10');
    expect(defaultFor(load('26.3'), 'port')).toBe('25565');
    expect(defaultFor(load('1.21.11'), 'commandBlocks')).toBeUndefined();
  });

  it('every option maps to a distinct key', () => {
    expect(new Set(OPTIONS.map((o) => o.key)).size).toBe(OPTIONS.length);
  });

  it('options that exist in every supported version stay available everywhere', () => {
    for (const id of allIds) {
      const status = describeOptions(load(id));
      for (const opt of [
        'difficulty',
        'gamemode',
        'hardcore',
        'maxPlayers',
        'motd',
        'seed',
        'viewDistance',
        'simulationDistance',
        'port',
        'allowFlight',
        'spawnProtection',
      ] as const) {
        expect(status[opt].available, `${id} ${opt}`).toBe(true);
      }
    }
  });
});
