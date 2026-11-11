// How to start a given version, from its profile plus the player's RAM and GUI choice.
// Across every supported version (1.18.2+) the jar is a "bundler" started with
// `java -jar server.jar`; what differs is the Java version and the options it lists.
import type { ServerConfig, VersionProfile } from './types';

export class LaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LaunchError';
  }
}

export interface LaunchSpec {
  /** Minimum Java major the player needs. */
  javaMajor: number;
  jvmArgs: string[];
  jar: 'server.jar';
  jarArgs: string[];
}

export function buildLaunch(
  profile: VersionProfile,
  config: Pick<ServerConfig, 'ramGb' | 'gui'>,
): LaunchSpec {
  if (!profile.launch.bundler) {
    throw new LaunchError(
      `${profile.id} is not started with "java -jar server.jar"; this tool cannot build a launcher for it`,
    );
  }
  return {
    javaMajor: profile.javaMajor,
    jvmArgs: ['-Xms1G', `-Xmx${config.ramGb}G`],
    jar: 'server.jar',
    jarArgs: config.gui ? [] : [profile.launch.nogui],
  };
}

/** Human-readable command line (for the README and tests). */
export function formatCommand(spec: LaunchSpec): string {
  return ['java', ...spec.jvmArgs, '-jar', spec.jar, ...spec.jarArgs].join(' ');
}
