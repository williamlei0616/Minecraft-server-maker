import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/core/config';
import type { ServerConfig, VersionsFile } from '../src/core/types';

describe('shared types', () => {
  it('memory is any whole number of GB from 1 to 128', () => {
    expect(LIMITS.ramGb).toEqual([1, 128]);
  });

  it('the committed versions.json satisfies the VersionsFile contract', async () => {
    const file = (await import('../public/versions.json')).default as VersionsFile;
    expect(file.schema).toBe(1);
    expect(file.versions.length).toBeGreaterThan(0);
    expect(file.versions.some((v) => v.id === file.latest.release)).toBe(true);
    for (const v of file.versions) {
      expect(v.jar.sha1).toMatch(/^[0-9a-f]{40}$/);
      expect(v.jar.url.startsWith('https://')).toBe(true);
      expect(v.javaMajor).toBeGreaterThanOrEqual(17);
    }
  });

  it('a ServerConfig can be constructed with the documented fields', () => {
    const cfg: ServerConfig = {
      versionId: '26.3',
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
      eulaAccepted: false,
    };
    expect(cfg.eulaAccepted).toBe(false);
  });
});
