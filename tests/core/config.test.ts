import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultConfig, validate } from '../../src/core/config';
import { VersionsError, loadVersions, parseVersions } from '../../src/core/versions';
import type { ServerConfig, VersionsFile } from '../../src/core/types';

const file = JSON.parse(
  readFileSync(new URL('../../public/versions.json', import.meta.url), 'utf8'),
) as VersionsFile;
const base = (): ServerConfig => ({ ...defaultConfig(file), eulaAccepted: true });
const errorsOf = (c: ServerConfig) => {
  const r = validate(c, file.versions);
  return r.ok ? {} : r.errors;
};

describe('defaultConfig', () => {
  it('matches the documented defaults on the newest release', () => {
    const c = defaultConfig(file);
    expect(c.versionId).toBe(file.latest.release);
    expect(c).toMatchObject({
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
      eulaAccepted: false,
    });
  });

  it('is valid out of the box', () => {
    expect(validate(defaultConfig(file), file.versions)).toEqual({ ok: true });
  });
});

describe('validate', () => {
  it('accepts the edges of every range', () => {
    expect(
      errorsOf({
        ...base(),
        maxPlayers: 1,
        viewDistance: 3,
        simulationDistance: 32,
        port: 1024,
        spawnProtection: 0,
      }),
    ).toEqual({});
    expect(
      errorsOf({
        ...base(),
        maxPlayers: 100,
        viewDistance: 32,
        simulationDistance: 3,
        port: 65535,
        spawnProtection: 64,
      }),
    ).toEqual({});
  });

  it('memory accepts any whole GB from 1 to 128 (6, 10, 24 are fine now)', () => {
    for (const ramGb of [1, 2, 6, 10, 24, 64, 128])
      expect(errorsOf({ ...base(), ramGb }).ramGb, String(ramGb)).toBeUndefined();
    for (const ramGb of [0, 129, -4, 2.5, Number.NaN])
      expect(errorsOf({ ...base(), ramGb }).ramGb, String(ramGb)).toBe(
        'Type a whole number from 1 to 128.',
      );
  });

  it('rejects one step outside every range, and non-integers', () => {
    const e = errorsOf({
      ...base(),
      maxPlayers: 0,
      viewDistance: 2,
      simulationDistance: 33,
      port: 1023,
      spawnProtection: 65,
    });
    expect(Object.keys(e).sort()).toEqual([
      'maxPlayers',
      'port',
      'simulationDistance',
      'spawnProtection',
      'viewDistance',
    ]);
    expect(errorsOf({ ...base(), port: 25565.5 }).port).toMatch(/whole number/);
    expect(errorsOf({ ...base(), port: Number.NaN }).port).toBeDefined();
  });

  it('keeps the wording the UI stub already uses', () => {
    expect(errorsOf({ ...base(), port: 80 }).port).toBe('Type a whole number from 1024 to 65535.');
    expect(errorsOf({ ...base(), versionId: 'nope' }).versionId).toBe(
      'Pick one of the versions in the list.',
    );
    expect(errorsOf({ ...base(), motd: '   ' }).motd).toBe(
      'Give your server a name, or friends will see a blank.',
    );
  });

  it('validates the operator username strictly, including shell-looking input', () => {
    expect(errorsOf({ ...base(), opUsername: '' })).toEqual({});
    expect(errorsOf({ ...base(), opUsername: 'Steve_01' })).toEqual({});
    for (const bad of [
      'ab',
      'a'.repeat(17),
      'has space',
      'a;rm -rf /',
      '$(id)',
      'x"y',
      "x'y",
      'ünïcode',
      '%PATH%',
      '..\\x',
    ]) {
      expect(errorsOf({ ...base(), opUsername: bad }).opUsername, bad).toBeDefined();
    }
  });

  it('rejects unknown enum values and wrong types', () => {
    const c = base() as unknown as Record<string, unknown>;
    expect(errorsOf({ ...c, ramGb: '4' } as unknown as ServerConfig).ramGb).toBeDefined();
    expect(
      errorsOf({ ...c, difficulty: 'nightmare' } as unknown as ServerConfig).difficulty,
    ).toBeDefined();
    expect(errorsOf({ ...c, gamemode: 'god' } as unknown as ServerConfig).gamemode).toBeDefined();
    expect(errorsOf({ ...c, pvp: 'yes' } as unknown as ServerConfig).pvp).toBeDefined();
  });

  it('limits free-text lengths', () => {
    expect(errorsOf({ ...base(), motd: 'x'.repeat(201) }).motd).toBeDefined();
    expect(errorsOf({ ...base(), motd: 'x'.repeat(200) }).motd).toBeUndefined();
    expect(errorsOf({ ...base(), seed: 'x'.repeat(129) }).seed).toBeDefined();
  });

  it('does not treat an unticked EULA as a field error (the button handles it)', () => {
    expect(errorsOf({ ...base(), eulaAccepted: false })).toEqual({});
  });
});

describe('parseVersions / loadVersions', () => {
  const clone = () => structuredClone(file) as unknown as Record<string, unknown>;
  const codeOf = (fn: () => unknown) => {
    try {
      fn();
      return 'ok';
    } catch (e) {
      return e instanceof VersionsError ? e.code : 'other';
    }
  };

  it('accepts the committed file', () => {
    expect(parseVersions(file).versions.length).toBe(file.versions.length);
  });

  it('rejects malformed data with a typed error', () => {
    const wrongSchema = clone();
    wrongSchema.schema = 2;
    expect(codeOf(() => parseVersions(wrongSchema))).toBe('schema');
    expect(codeOf(() => parseVersions(null))).toBe('shape');
    expect(codeOf(() => parseVersions({ schema: 1, versions: [] }))).toBe('shape');

    const evilHost = clone();
    (evilHost.versions as { jar: { url: string } }[])[0]!.jar.url =
      'https://evil.example.com/server.jar';
    expect(codeOf(() => parseVersions(evilHost))).toBe('shape');

    const noLatest = clone();
    (noLatest.latest as { release: string }).release = 'not-listed';
    expect(codeOf(() => parseVersions(noLatest))).toBe('shape');
  });

  it('classifies network failures, bad JSON and success', async () => {
    const run = async (fetchImpl: unknown) => {
      try {
        await loadVersions('/versions.json', { fetch: fetchImpl as typeof fetch });
        return 'ok';
      } catch (e) {
        return e instanceof VersionsError ? e.code : 'other';
      }
    };
    expect(await run(async () => new Response(JSON.stringify(file)))).toBe('ok');
    expect(await run(async () => new Response('', { status: 500 }))).toBe('network');
    expect(
      await run(async () => {
        throw new Error('offline');
      }),
    ).toBe('network');
    expect(await run(async () => new Response('<html>'))).toBe('shape');
  });
});

describe('validation codes (for translation)', () => {
  const detailsOf = (c: ServerConfig) => {
    const r = validate(c, file.versions);
    return r.ok ? {} : r.details;
  };

  it('every error also has a code, and the English message stays', () => {
    const c = {
      ...base(),
      port: 80,
      maxPlayers: 0,
      motd: '  ',
      opUsername: 'a b',
      versionId: 'nope',
      seed: 'x'.repeat(200),
    };
    const r = validate(c, file.versions);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.details).sort()).toEqual(Object.keys(r.errors).sort());
    expect(r.errors.port).toBe('Type a whole number from 1024 to 65535.');
  });

  it('range errors carry their limits so the page can say them in any language', () => {
    expect(detailsOf({ ...base(), port: 80 }).port).toEqual({
      code: 'range',
      min: 1024,
      max: 65535,
    });
    expect(detailsOf({ ...base(), ramGb: 0 }).ramGb).toEqual({ code: 'range', min: 1, max: 128 });
  });

  it('each kind of mistake has its own code', () => {
    expect(detailsOf({ ...base(), versionId: 'nope' }).versionId?.code).toBe('version');
    expect(detailsOf({ ...base(), motd: ' ' }).motd?.code).toBe('blank');
    expect(detailsOf({ ...base(), motd: 'x'.repeat(201) }).motd).toEqual({
      code: 'tooLong',
      max: 200,
    });
    expect(detailsOf({ ...base(), seed: 'x'.repeat(129) }).seed).toEqual({
      code: 'tooLong',
      max: 128,
    });
    expect(detailsOf({ ...base(), opUsername: 'a b' }).opUsername?.code).toBe('username');
    expect(detailsOf({ ...base(), pvp: 'yes' as unknown as boolean }).pvp?.code).toBe('onoff');
    expect(
      detailsOf({ ...base(), difficulty: 'x' as unknown as ServerConfig['difficulty'] }).difficulty
        ?.code,
    ).toBe('choice');
  });
});

describe('player lists', () => {
  const detailsOf = (c: ServerConfig) => {
    const r = validate(c, file.versions);
    return r.ok ? {} : r.details;
  };

  it('defaults to anyone may join and empty lists', () => {
    expect(defaultConfig(file)).toMatchObject({
      whitelist: false,
      allowedPlayers: [],
      blockedPlayers: [],
      blockedIps: [],
    });
  });

  it('accepts good names and addresses', () => {
    expect(
      errorsOf({
        ...base(),
        whitelist: true,
        opUsername: 'Notch',
        allowedPlayers: ['Alex', 'steve_01'],
        blockedPlayers: ['Griefer99'],
        blockedIps: ['203.0.113.7', '2001:db8::1', '::1'],
      }),
    ).toEqual({});
  });

  it('rejects names that are not Minecraft usernames, naming the bad one', () => {
    const c = { ...base(), allowedPlayers: ['Alex', 'a b'] };
    expect(detailsOf(c).allowedPlayers).toEqual({ code: 'listName', value: 'a b' });
    expect(errorsOf(c).allowedPlayers).toContain('"a b"');
    expect(detailsOf({ ...base(), blockedPlayers: ['ab'] }).blockedPlayers?.code).toBe('listName');
    expect(detailsOf({ ...base(), blockedPlayers: ['x"; rm -rf /'] }).blockedPlayers?.code).toBe(
      'listName',
    );
  });

  it('limits the length of each list and rejects duplicates in any letter case', () => {
    const many = Array.from({ length: 51 }, (_, i) => `Player${i + 10}`);
    expect(detailsOf({ ...base(), allowedPlayers: many }).allowedPlayers).toEqual({
      code: 'listTooMany',
      max: 50,
    });
    expect(
      errorsOf({ ...base(), allowedPlayers: many.slice(0, 50) }).allowedPlayers,
    ).toBeUndefined();
    expect(detailsOf({ ...base(), blockedPlayers: ['Alex', 'ALEX'] }).blockedPlayers).toEqual({
      code: 'listDuplicate',
      value: 'ALEX',
    });
  });

  it('rejects a name on both lists, and blocking the owner', () => {
    expect(
      detailsOf({ ...base(), allowedPlayers: ['Alex'], blockedPlayers: ['alex'] }).blockedPlayers,
    ).toEqual({ code: 'listOverlap', value: 'alex' });
    expect(
      detailsOf({ ...base(), opUsername: 'Notch', blockedPlayers: ['notch'] }).blockedPlayers?.code,
    ).toBe('blockOwner');
  });

  it('refuses a locked-out server: allow list on with nobody to let in', () => {
    expect(detailsOf({ ...base(), whitelist: true }).allowedPlayers).toEqual({
      code: 'whitelistEmpty',
    });
    // the owner counts as someone, and so does any name on the list
    expect(errorsOf({ ...base(), whitelist: true, opUsername: 'Notch' })).toEqual({});
    expect(errorsOf({ ...base(), whitelist: true, allowedPlayers: ['Alex'] })).toEqual({});
    // not on: an empty list is fine
    expect(errorsOf({ ...base(), whitelist: false })).toEqual({});
  });

  it('blocked IPs: only real addresses', () => {
    for (const ip of ['1.2.3.4', '255.255.255.255', '::1', 'fe80::1', '2001:db8:0:0:0:0:0:1']) {
      expect(errorsOf({ ...base(), blockedIps: [ip] }).blockedIps, ip).toBeUndefined();
    }
    for (const ip of [
      '256.1.1.1',
      '1.2.3',
      '01.2.3.4',
      'example.com',
      '1.2.3.4/24',
      '::g',
      ':::',
      '',
      '1.2.3.4; rm',
    ]) {
      expect(detailsOf({ ...base(), blockedIps: [ip] }).blockedIps?.code, ip).toBe('ipInvalid');
    }
    expect(detailsOf({ ...base(), blockedIps: ['1.2.3.4', '1.2.3.4'] }).blockedIps?.code).toBe(
      'listDuplicate',
    );
  });

  it('tolerates a malformed config without throwing', () => {
    const c = {
      ...base(),
      allowedPlayers: 'Alex' as unknown as string[],
      blockedIps: 5 as unknown as string[],
    };
    expect(detailsOf(c).allowedPlayers?.code).toBe('listName');
    expect(detailsOf(c).blockedIps?.code).toBe('ipInvalid');
  });
});
