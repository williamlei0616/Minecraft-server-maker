// Public API of the core library. The UI imports from here and nothing deeper.
//   loadVersions(url)                 -> the version list
//   defaultConfig(versionsFile)       -> starting options on the newest release
//   validate(config, versions)        -> field errors for the form
//   loadProfile(entry, ctx?)          -> what that version really supports
//   describeOptions(profile)          -> which options that version lacks (and why)
//   buildBundle(config, versions, ctx?) -> Blob of the zip (needs eulaAccepted)
export { buildBundle, BundleError, buildBundleFiles, zipBundle, bundleFolderName } from './bundle';
export {
  defaultConfig,
  validate,
  isIpAddress,
  LIMITS,
  LIST_MAX,
  OP_USERNAME_PATTERN,
} from './config';
export {
  EXTRA_MAX,
  EXTRA_VALUE_MAX,
  checkExtraProperties,
  editorText,
  isSecretKey,
  lockedKeys,
  overridesFromText,
  overridesToText,
  overridesToTextWithoutSecrets,
  parseEditorText,
  propertyKind,
  type EditorResult,
  type IssueCode,
  type PropertyIssue,
  type PropertyKind,
} from './extras';
export type { PropertyEntry } from './javaProperties.mjs';
export {
  LEVEL_DAT_MAX_BYTES,
  MAP_NAME_MAX,
  MapError,
  checkMapCompat,
  gunzip,
  isSafeMapFolderName,
  parseNbt,
  readLevelDat,
  type LevelInfo,
  type MapErrorCode,
  type MapVerdict,
  type NbtValue,
} from './map';
export { buildLaunch, formatCommand, LaunchError, type LaunchSpec } from './launch';
export { describeOptions, defaultFor, OPTIONS, type OptionId, type OptionStatus } from './options';
export { loadProfile, parseProfile, ProfileError, profileUrl, type CoreContext } from './profile';
export { planProperties, renderServerProperties, type PropertiesPlan } from './properties';
export { loadVersions, parseVersions, VersionsError } from './versions';
export type {
  BundleLocale,
  Difficulty,
  Gamemode,
  ServerConfig,
  ValidationCode,
  ValidationDetail,
  ValidationResult,
  VersionEntry,
  VersionProfile,
  VersionsFile,
} from './types';
