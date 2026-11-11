/* global URL */
// The only hosts we ever trust for Mojang metadata and server jars. Shared by the data
// scripts (scripts/) and the core library so the allowlist cannot drift apart.

/** Hosts we accept for version metadata. */
export const META_HOSTS = new Set(['piston-meta.mojang.com', 'launchermeta.mojang.com']);

/** Hosts we accept for the server jar URL (baked into the generated start scripts). */
export const JAR_HOSTS = new Set(['piston-data.mojang.com', 'launcher.mojang.com']);

/** True only for an https URL whose hostname is exactly one of `hosts`. */
export function isAllowedHttpsUrl(value, hosts) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && hosts.has(u.hostname);
  } catch {
    return false;
  }
}
