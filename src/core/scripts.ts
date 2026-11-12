// Renders the two launcher scripts. These are the riskiest files in the product: they run
// on a stranger's computer. Rules:
//  * Only values that passed assertScriptInput() are ever written into a script.
//  * Templates are exact strings (this file is excluded from Prettier); start.bat is CRLF,
//    start.sh is LF.
//  * The jar is NEVER bundled: the script downloads it from Mojang into a shared per-user
//    cache, verifies the sha1 baked in from versions.json, and copies it next to the script.
import { LIST_MAX, isIpAddress } from './config';
import { JAR_HOSTS, isAllowedHttpsUrl } from './hosts.mjs';

export interface ScriptInput {
  versionId: string;
  jarUrl: string;
  jarSha1: string;
  /** Rounded download size, for the "about N MB" message. */
  jarMegabytes: number;
  /** Minimum Java major the player needs. */
  javaMajor: number;
  /** Fixed JVM tokens, e.g. ['-Xms1G', '-Xmx4G']. */
  jvmArgs: string[];
  /** Fixed jar arguments, e.g. ['--nogui'] or []. */
  jarArgs: string[];
  /** '' or a validated Minecraft username. */
  opUsername: string;
  /** true = only the allow list, the owner and operators can join. */
  whitelist?: boolean;
  /** Validated Minecraft usernames for whitelist.json (at most 50). */
  allowedPlayers?: string[];
  /** Validated Minecraft usernames for banned-players.json (at most 50). */
  blockedPlayers?: string[];
  /** Validated IP addresses for banned-ips.json (at most 50). */
  blockedIps?: string[];
  /** The site's help page (in the page's language). The script prints it next to Java and download problems. */
  helpUrl?: string;
}

export class ScriptInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptInputError';
  }
}

const VERSION_ID = /^[0-9A-Za-z][0-9A-Za-z._-]{0,40}$/;
const URL_CHARS = /^[A-Za-z0-9:/._-]+$/;
const SHA1 = /^[0-9a-f]{40}$/;
const JVM_ARG = /^(-X(ms|mx)[0-9]{1,3}[GM]|-D[A-Za-z0-9._]+=[A-Za-z0-9._/-]+)$/;
const JAR_ARG = /^(--)?[A-Za-z][A-Za-z0-9]{0,30}$/;
const USERNAME = /^[A-Za-z0-9_]{3,16}$/;
// Printed, never fetched or run; no '#' (the script adds #topic), no quotes, no percent signs.
const HELP_URL = /^https?:\/\/[A-Za-z0-9.:/_-]{1,200}$/;

export function assertScriptInput(i: ScriptInput): void {
  const bad = (what: string): never => {
    throw new ScriptInputError(`refusing to write a script with an unsafe ${what}`);
  };
  if (!VERSION_ID.test(i.versionId)) bad('version id');
  if (!isAllowedHttpsUrl(i.jarUrl, JAR_HOSTS) || !URL_CHARS.test(i.jarUrl)) bad('jar URL');
  if (!SHA1.test(i.jarSha1)) bad('sha1');
  if (!Number.isInteger(i.jarMegabytes) || i.jarMegabytes < 1 || i.jarMegabytes > 2000) bad('download size');
  if (!Number.isInteger(i.javaMajor) || i.javaMajor < 8 || i.javaMajor > 99) bad('Java version');
  if (!i.jvmArgs.every((a) => JVM_ARG.test(a))) bad('JVM argument');
  if (!i.jarArgs.every((a) => JAR_ARG.test(a))) bad('jar argument');
  if (i.opUsername !== '' && !USERNAME.test(i.opUsername)) bad('username');
  if (i.helpUrl !== undefined && i.helpUrl !== '' && !HELP_URL.test(i.helpUrl)) bad('help URL');
  if (i.whitelist !== undefined && typeof i.whitelist !== 'boolean') bad('allow list switch');
  const names = (list: string[] | undefined, what: string): void => {
    if (list === undefined) return;
    if (!Array.isArray(list) || list.length > LIST_MAX || !list.every((n) => USERNAME.test(n))) bad(what);
  };
  names(i.allowedPlayers, 'allow list');
  names(i.blockedPlayers, 'block list');
  const ips = i.blockedIps;
  if (ips !== undefined && (!Array.isArray(ips) || ips.length > LIST_MAX || !ips.every(isIpAddress))) {
    bad('blocked address');
  }
}

const ADOPTIUM = (major: number) => `https://adoptium.net/temurin/releases/?version=${major}`;
const LOOKUP_API = 'https://api.minecraftservices.com/minecraft/profile/lookup/bulk/byname';

/** What the player-list step needs, with the optional fields filled in. */
function playerLists(i: ScriptInput) {
  return {
    whitelist: i.whitelist === true,
    allow: i.allowedPlayers ?? [],
    block: i.blockedPlayers ?? [],
    ips: i.blockedIps ?? [],
  };
}

/** Does the bundle need the operator / player-list step (and so players.ps1 on Windows)? */
export function needsPlayersStep(i: ScriptInput): boolean {
  const l = playerLists(i);
  return i.opUsername !== '' || l.whitelist || l.allow.length > 0 || l.block.length > 0 || l.ips.length > 0;
}

/**
 * players.ps1: run by start.bat. Looks the names up with Mojang (10 at a time, one request per
 * batch) and writes ops.json, whitelist.json, banned-players.json and banned-ips.json, but only
 * when the file is missing or holds nobody, so a server that is already set up keeps its lists.
 * Everything arrives through environment variables set by start.bat; nothing is spliced in.
 * Written in plain ASCII with CRLF line ends.
 */
const PLAYERS_PS1 = String.raw`# Minecraft Server Maker: sets up the operator and the player lists.
# Run by start.bat. Names are looked up with Mojang, 10 at a time.
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
$api = '${LOOKUP_API}'
if ($env:MCSM_LOOKUP_API) { $api = $env:MCSM_LOOKUP_API }
$here = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Items([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return @() }
  return @($text.Split(',') | Where-Object { $_ -ne '' })
}
$op = [string]$env:OP_NAME
$allow = @(Get-Items $env:ALLOW_NAMES)
$block = @(Get-Items $env:BLOCK_NAMES)
$ips = @(Get-Items $env:BLOCK_IPS)
$whitelistOn = ($env:WHITELIST -eq '1')

function NeedsFile([string]$name) {
  $path = Join-Path $here $name
  if (-not (Test-Path -LiteralPath $path)) { return $true }
  $raw = [System.IO.File]::ReadAllText($path)
  return -not (($raw -match '"uuid"') -or ($raw -match '"ip"'))
}
function WriteJson([string]$name, $rows) {
  $list = @($rows)
  if ($list.Count -eq 0) { return }
  $json = ConvertTo-Json -InputObject $list
  [System.IO.File]::WriteAllText((Join-Path $here $name), $json, $utf8)
}

$found = @{}
$unreached = @{}
function FindNames([string[]]$names) {
  for ($i = 0; $i -lt $names.Count; $i += 10) {
    $last = [Math]::Min($i + 9, $names.Count - 1)
    $batch = @($names[$i..$last])
    try {
      $body = ConvertTo-Json -InputObject $batch -Compress
      $reply = Invoke-RestMethod -Method Post -Uri $api -ContentType 'application/json' -Body $body -TimeoutSec 20
      foreach ($p in @($reply)) {
        if ($p -and ([string]$p.id) -match '^[0-9a-fA-F]{32}$' -and ([string]$p.name) -match '^[A-Za-z0-9_]{3,16}$') {
          $id = ([string]$p.id).ToLower()
          $uuid = $id.Substring(0,8) + '-' + $id.Substring(8,4) + '-' + $id.Substring(12,4) + '-' + $id.Substring(16,4) + '-' + $id.Substring(20)
          $script:found[([string]$p.name).ToLower()] = [ordered]@{ uuid = $uuid; name = [string]$p.name }
        }
      }
    } catch {
      foreach ($n in $batch) { $script:unreached[$n.ToLower()] = $true }
    }
  }
}
function Person([string]$n) { return $script:found[$n.ToLower()] }

$names = @()
foreach ($n in (@($op) + $allow + $block)) {
  if ($n -and ($names -notcontains $n)) { $names += $n }
}
$now = [DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss') + ' +0000'
$problem = $false
try {
  if ($op) { Write-Host "Making $op an operator..." }
  if ($names.Count -gt 0) { FindNames $names }

  if ($op -and (NeedsFile 'ops.json')) {
    $p = Person $op
    if ($p) { WriteJson 'ops.json' @([ordered]@{ uuid = $p.uuid; name = $p.name; level = 4; bypassesPlayerLimit = $false }) }
  }
  if (($whitelistOn -or $allow.Count -gt 0) -and (NeedsFile 'whitelist.json')) {
    $who = @($allow)
    if ($whitelistOn -and $op) { $who += $op }
    $seen = @{}
    $rows = @()
    foreach ($n in $who) {
      $p = Person $n
      if ($p -and -not $seen.ContainsKey($p.uuid)) {
        $seen[$p.uuid] = $true
        $rows += [ordered]@{ uuid = $p.uuid; name = $p.name }
      }
    }
    WriteJson 'whitelist.json' $rows
  }
  if ($block.Count -gt 0 -and (NeedsFile 'banned-players.json')) {
    $rows = @()
    foreach ($n in $block) {
      $p = Person $n
      if ($p) { $rows += [ordered]@{ uuid = $p.uuid; name = $p.name; created = $now; source = 'Minecraft Server Maker'; expires = 'forever'; reason = 'Blocked by the server owner' } }
    }
    WriteJson 'banned-players.json' $rows
  }
  if ($ips.Count -gt 0 -and (NeedsFile 'banned-ips.json')) {
    $rows = @()
    foreach ($ip in $ips) {
      $rows += [ordered]@{ ip = $ip; created = $now; source = 'Minecraft Server Maker'; expires = 'forever'; reason = 'Blocked by the server owner' }
    }
    WriteJson 'banned-ips.json' $rows
  }

  $noNet = @()
  $notFound = @()
  foreach ($n in $names) {
    if (-not (Person $n)) {
      if ($unreached[$n.ToLower()]) { $noNet += $n } else { $notFound += $n }
    }
  }
  if ($noNet.Count -gt 0) { Write-Host ('Could not reach Mojang to look up: ' + ($noNet -join ', ')) }
  if ($notFound.Count -gt 0) { Write-Host ('No Minecraft account was found for: ' + ($notFound -join ', ') + ' (check the spelling)') }
  if ($noNet.Count + $notFound.Count -gt 0) {
    $problem = $true
    Write-Host 'Afterwards, you can fix this by typing in the server window:'
    foreach ($n in ($noNet + $notFound)) {
      if ($n -eq $op) { Write-Host "  op $n" }
      if ($allow -contains $n) { Write-Host "  whitelist add $n" }
      if ($block -contains $n) { Write-Host "  ban $n" }
    }
  }
} catch {
  Write-Host 'Something went wrong while setting up the players.'
  $problem = $true
}
if ($problem) { exit 1 }
exit 0
`.replace(/\r?\n/g, '\r\n');

/** The PowerShell file that start.bat runs for the operator and player lists. */
export function renderPlayersPs1(input: ScriptInput): string {
  assertScriptInput(input);
  return PLAYERS_PS1;
}

/** The same step for start.sh: the section between "Server jar" and "Start". */
function playersSh(more: string): string[] {
  return String.raw`# ----- 3. Operator and player lists -----
LOOKUP_API='${LOOKUP_API}'
if [ -n "$MCSM_LOOKUP_API" ]; then LOOKUP_API="$MCSM_LOOKUP_API"; fi
NOW=$(date -u '+%Y-%m-%d %H:%M:%S +0000')
FOUND=''
UNREACHED=''
ALL_NAMES=''
ROWS=''
lower() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }
items() { if [ -n "$1" ]; then printf '%s\n' "$1" | tr ',' '\n'; fi; }
add_name() {
  case " $(lower "$ALL_NAMES") " in
    *" $(lower "$1") "*) ;;
    *) ALL_NAMES="$ALL_NAMES $1" ;;
  esac
}
post_json() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 20 -H 'Content-Type: application/json' -d "$1" "$LOOKUP_API" 2>/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- -T 20 --header='Content-Type: application/json' --post-data="$1" "$LOOKUP_API" 2>/dev/null
  else
    return 1
  fi
}
lookup_batch() {
  if REPLY=$(post_json "[$1]"); then
    PARSED=$(printf '%s' "$REPLY" | tr -d '\r\n' | tr '}' '\n' | while IFS= read -r OBJ; do
      ID=$(printf '%s' "$OBJ" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]\{32\}\)".*/\1/p')
      NM=$(printf '%s' "$OBJ" | sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([A-Za-z0-9_]\{3,16\}\)".*/\1/p')
      if [ -n "$ID" ] && [ -n "$NM" ]; then printf '%s %s %s\n' "$(lower "$NM")" "$(lower "$ID")" "$NM"; fi
    done)
    FOUND="$FOUND
$PARSED"
  else
    UNREACHED="$UNREACHED $2"
  fi
}
lookup_all() {
  B=''; BN=''; C=0
  for NM in $ALL_NAMES; do
    if [ -n "$B" ]; then B="$B,"; fi
    B="$B\"$NM\""
    BN="$BN $NM"
    C=$((C + 1))
    if [ "$C" -eq 10 ]; then lookup_batch "$B" "$BN"; B=''; BN=''; C=0; fi
  done
  if [ "$C" -gt 0 ]; then lookup_batch "$B" "$BN"; fi
}
dash() { printf '%s' "$1" | sed 's/^\(.\{8\}\)\(.\{4\}\)\(.\{4\}\)\(.\{4\}\)\(.\{12\}\)$/\1-\2-\3-\4-\5/'; }
person() {
  LINE=$(printf '%s\n' "$FOUND" | grep "^$(lower "$1") " | head -n 1)
  [ -n "$LINE" ] || return 1
  P_UUID=$(dash "$(printf '%s' "$LINE" | cut -d ' ' -f 2)")
  P_NAME=$(printf '%s' "$LINE" | cut -d ' ' -f 3)
}
needs_file() { ! grep -q -e '"uuid"' -e '"ip"' "$1" 2>/dev/null; }
add_row() {
  ROWS="$ROWS$1
"
}
put_json() {
  [ -n "$2" ] || return 0
  { echo '['; printf '%s' "$2" | sed 's/^/  /; $!s/$/,/'; echo ']'; } > "$1"
}
if [ -n "$OP_NAME" ]; then add_name "$OP_NAME"; fi
for NM in $(items "$ALLOW_NAMES") $(items "$BLOCK_NAMES"); do add_name "$NM"; done
if [ -n "$OP_NAME" ]; then echo "Making $OP_NAME an operator..."; fi
if [ -n "$ALL_NAMES" ]; then lookup_all; fi

if [ -n "$OP_NAME" ] && needs_file ops.json; then
  if person "$OP_NAME"; then
    printf '[{"uuid":"%s","name":"%s","level":4,"bypassesPlayerLimit":false}]\n' "$P_UUID" "$P_NAME" > ops.json
  fi
fi
if { [ "$WHITELIST" = 1 ] || [ -n "$ALLOW_NAMES" ]; } && needs_file whitelist.json; then
  ROWS=''
  WHO=$(items "$ALLOW_NAMES")
  if [ "$WHITELIST" = 1 ] && [ -n "$OP_NAME" ]; then WHO="$WHO $OP_NAME"; fi
  SEEN=' '
  for NM in $WHO; do
    if person "$NM"; then
      case "$SEEN" in
        *" $P_UUID "*) ;;
        *)
          SEEN="$SEEN$P_UUID "
          add_row "$(printf '{"uuid":"%s","name":"%s"}' "$P_UUID" "$P_NAME")"
          ;;
      esac
    fi
  done
  put_json whitelist.json "$ROWS"
fi
if [ -n "$BLOCK_NAMES" ] && needs_file banned-players.json; then
  ROWS=''
  for NM in $(items "$BLOCK_NAMES"); do
    if person "$NM"; then
      add_row "$(printf '{"uuid":"%s","name":"%s","created":"%s","source":"Minecraft Server Maker","expires":"forever","reason":"Blocked by the server owner"}' "$P_UUID" "$P_NAME" "$NOW")"
    fi
  done
  put_json banned-players.json "$ROWS"
fi
if [ -n "$BLOCK_IPS" ] && needs_file banned-ips.json; then
  ROWS=''
  for IP in $(items "$BLOCK_IPS"); do
    add_row "$(printf '{"ip":"%s","created":"%s","source":"Minecraft Server Maker","expires":"forever","reason":"Blocked by the server owner"}' "$IP" "$NOW")"
  done
  put_json banned-ips.json "$ROWS"
fi

NONET=''
NOTFOUND=''
for NM in $ALL_NAMES; do
  if ! person "$NM"; then
    case "$UNREACHED " in
      *" $NM "*) NONET="$NONET $NM" ;;
      *) NOTFOUND="$NOTFOUND $NM" ;;
    esac
  fi
done
if [ -n "$NONET" ]; then echo "Could not reach Mojang to look up:$NONET"; fi
if [ -n "$NOTFOUND" ]; then echo "No Minecraft account was found for:$NOTFOUND (check the spelling)"; fi
if [ -n "$NONET$NOTFOUND" ]; then
  echo "Afterwards, you can fix this by typing in the server window:"
  for NM in $NONET $NOTFOUND; do
    L=$(lower "$NM")
    if [ "$L" = "$(lower "$OP_NAME")" ]; then echo "  op $NM"; fi
    case ",$(lower "$ALLOW_NAMES")," in *",$L,"*) echo "  whitelist add $NM" ;; esac
    case ",$(lower "$BLOCK_NAMES")," in *",$L,"*) echo "  ban $NM" ;; esac
  done
fi
if [ "$WHITELIST" = 1 ] && ! grep -q '"uuid"' whitelist.json 2>/dev/null && ! grep -q '"uuid"' ops.json 2>/dev/null; then
  fail "" "The allow list is on, but nobody could be added to it (the names could not be looked up)." "The server was not started, so that nobody, including you, is locked out." "Check your internet connection and run this file again."${more}
fi
`
    .split('\n')
    .slice(0, -1);
}

export function renderStartBat(input: ScriptInput): string {
  assertScriptInput(input);
  const lists = playerLists(input);
  const players = needsPlayersStep(input);
  const more = (topic: string): string[] => (input.helpUrl ? [`echo More help: ${input.helpUrl}#${topic}`] : []);
  const L: string[] = [
    '@echo off',
    'setlocal EnableExtensions DisableDelayedExpansion',
    'cd /d "%~dp0"',
    '',
    'rem ===== Settings written by Minecraft Server Maker =====',
    `set "MC_VERSION=${input.versionId}"`,
    `set "JAR_URL=${input.jarUrl}"`,
    `set "JAR_SHA1=${input.jarSha1}"`,
    `set "JAR_MB=${input.jarMegabytes}"`,
    `set "JAVA_MIN=${input.javaMajor}"`,
    `set "OP_NAME=${input.opUsername}"`,
    `set "WHITELIST=${lists.whitelist ? 1 : 0}"`,
    `set "ALLOW_NAMES=${lists.allow.join(',')}"`,
    `set "BLOCK_NAMES=${lists.block.join(',')}"`,
    `set "BLOCK_IPS=${lists.ips.join(',')}"`,
    `set "JVM_ARGS=${input.jvmArgs.join(' ')}"`,
    `set "JAR_ARGS=${input.jarArgs.join(' ')}"`,
    'rem =======================================================',
    '',
    'title Minecraft server %MC_VERSION%',
    'echo Minecraft server %MC_VERSION%',
    'echo.',
    '',
    'rem ----- 1. Java -----',
    'where java >nul 2>&1',
    'if errorlevel 1 goto :nojava',
    'set "JAVA_RAW="',
    `for /f "tokens=3" %%v in ('java -version 2^>^&1 ^| findstr /i /c:" version "') do if not defined JAVA_RAW set "JAVA_RAW=%%~v"`,
    'if not defined JAVA_RAW goto :badjava',
    'set "JA=0"',
    'set "JB=0"',
    'for /f "tokens=1,2 delims=._-+" %%a in ("%JAVA_RAW%") do (set "JA=%%a" & set "JB=%%b")',
    'set "JAVA_MAJOR=%JA%"',
    'if "%JA%"=="1" set "JAVA_MAJOR=%JB%"',
    'set /a JAVA_NUM=%JAVA_MAJOR%+0 2>nul',
    'if %JAVA_NUM% LSS %JAVA_MIN% goto :oldjava',
    '',
    'rem ----- 2. Server jar: shared per-user cache, checked against Mojang\'s sha1 -----',
    'set "CACHE=%LOCALAPPDATA%\\MinecraftServerMaker\\jars"',
    'if defined MCSM_CACHE_DIR set "CACHE=%MCSM_CACHE_DIR%"',
    'if not exist "%CACHE%" mkdir "%CACHE%" >nul 2>&1',
    'set "CJAR=%CACHE%\\%JAR_SHA1%.jar"',
    'set "PART=%CACHE%\\%JAR_SHA1%.part"',
    'if not exist server.jar goto :trycache',
    'call :sha1 "server.jar" HAVE',
    'if /i "%HAVE%"=="%JAR_SHA1%" goto :havejar',
    ':trycache',
    'if not exist "%CJAR%" goto :download',
    'call :sha1 "%CJAR%" HAVE',
    'if /i "%HAVE%"=="%JAR_SHA1%" goto :usecache',
    'echo The saved copy is damaged. Downloading it again.',
    'del "%CJAR%" >nul 2>&1',
    ':download',
    'echo Downloading Minecraft server %MC_VERSION% from Mojang, about %JAR_MB% MB. This only happens the first time.',
    'where curl.exe >nul 2>&1',
    'if errorlevel 1 goto :dlps',
    'curl.exe -L --fail --retry 3 --retry-delay 2 -C - -o "%PART%" "%JAR_URL%"',
    'if errorlevel 1 goto :dlretry',
    'goto :verify',
    ':dlretry',
    'del "%PART%" >nul 2>&1',
    'curl.exe -L --fail --retry 3 --retry-delay 2 -o "%PART%" "%JAR_URL%"',
    'if errorlevel 1 goto :dlfail',
    'goto :verify',
    ':dlps',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing -Uri $env:JAR_URL -OutFile $env:PART } catch { exit 1 }"`,
    'if errorlevel 1 goto :dlfail',
    ':verify',
    'call :sha1 "%PART%" HAVE',
    'if /i "%HAVE%"=="%JAR_SHA1%" goto :verified',
    'del "%PART%" >nul 2>&1',
    'echo.',
    "echo The download did not match Mojang's checksum, so it was thrown away.",
    'echo Check your internet connection and run this file again.',
    ...more('download'),
    'goto :fail',
    ':dlfail',
    'echo.',
    'echo Could not download the server from Mojang. Check your internet connection and run this file again.',
    ...more('download'),
    'goto :fail',
    ':verified',
    'move /y "%PART%" "%CJAR%" >nul',
    ':usecache',
    'copy /y "%CJAR%" server.jar >nul',
    ':havejar',
    '',
    ...(players
      ? [
          'rem ----- 3. Operator and player lists -----',
          'echo Setting up the players...',
          // The output is shown: it names any player that could not be found.
          'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0players.ps1"',
          'if not "%WHITELIST%"=="1" goto :launch',
          'findstr /c:"uuid" whitelist.json >nul 2>&1 && goto :launch',
          'findstr /c:"uuid" ops.json >nul 2>&1 && goto :launch',
          'goto :locked',
          '',
        ]
      : []),
    'rem ----- 4. Start -----',
    ':launch',
    'echo.',
    'echo Starting the server. Type stop in the server window to shut it down.',
    'java %JVM_ARGS% -jar server.jar %JAR_ARGS%',
    'echo.',
    'echo The server has stopped.',
    'if not defined MCSM_NO_PAUSE pause',
    'endlocal',
    'exit /b 0',
    '',
    ...(players
      ? [
          ':locked',
          'echo.',
          'echo The allow list is on, but nobody could be added to it (the names could not be looked up).',
          'echo The server was not started, so that nobody, including you, is locked out.',
          'echo Check your internet connection and run this file again.',
          ...more('players'),
          'goto :fail',
          '',
        ]
      : []),
    ':nojava',
    'echo Java %JAVA_MIN% or newer is needed to run Minecraft %MC_VERSION%, but Java was not found on this computer.',
    'goto :javahelp',
    ':badjava',
    'echo Could not tell which Java version is installed.',
    'goto :javahelp',
    ':oldjava',
    'echo Minecraft %MC_VERSION% needs Java %JAVA_MIN% or newer, but this computer has Java %JAVA_MAJOR%.',
    ':javahelp',
    'echo Get Java %JAVA_MIN% (free) from: https://adoptium.net/temurin/releases/?version=%JAVA_MIN%',
    ...more('java'),
    ':fail',
    'echo.',
    'if not defined MCSM_NO_PAUSE pause',
    'endlocal',
    'exit /b 1',
    '',
    'rem ----- helper: sha1 of a file into the variable named by the 2nd argument -----',
    ':sha1',
    'set "%~2="',
    `for /f "skip=1 tokens=* delims=" %%h in ('certutil -hashfile "%~1" SHA1 2^>nul') do if not defined %~2 set "%~2=%%h"`,
    'if defined %~2 call set "%~2=%%%~2: =%%"',
    'exit /b 0',
  ];
  return L.join('\r\n') + '\r\n';
}

export function renderStartSh(input: ScriptInput): string {
  assertScriptInput(input);
  const lists = playerLists(input);
  const players = needsPlayersStep(input);
  const more = (topic: string): string => (input.helpUrl ? ` "More help: ${input.helpUrl}#${topic}"` : '');
  const L: string[] = [
    '#!/bin/sh',
    '# Minecraft Server Maker: start script (macOS / Linux). Run with:  sh start.sh',
    'cd "$(dirname "$0")" || exit 1',
    '',
    '# ===== Settings written by Minecraft Server Maker =====',
    `MC_VERSION='${input.versionId}'`,
    `JAR_URL='${input.jarUrl}'`,
    `JAR_SHA1='${input.jarSha1}'`,
    `JAR_MB='${input.jarMegabytes}'`,
    `JAVA_MIN='${input.javaMajor}'`,
    `OP_NAME='${input.opUsername}'`,
    `WHITELIST='${lists.whitelist ? 1 : 0}'`,
    `ALLOW_NAMES='${lists.allow.join(',')}'`,
    `BLOCK_NAMES='${lists.block.join(',')}'`,
    `BLOCK_IPS='${lists.ips.join(',')}'`,
    `JVM_ARGS='${input.jvmArgs.join(' ')}'`,
    `JAR_ARGS='${input.jarArgs.join(' ')}'`,
    '# =======================================================',
    '',
    'pause_and_exit() {',
    '  if [ -z "$MCSM_NO_PAUSE" ] && [ -t 0 ]; then',
    "    printf 'Press Enter to close... '",
    '    read -r _unused',
    '  fi',
    '  exit "$1"',
    '}',
    'fail() {',
    "  printf '%s\\n' \"$@\"",
    '  pause_and_exit 1',
    '}',
    '',
    'echo "Minecraft server $MC_VERSION"',
    'echo',
    '',
    '# ----- 1. Java -----',
    'JAVA_HELP="Get Java $JAVA_MIN (free) from: https://adoptium.net/temurin/releases/?version=$JAVA_MIN"',
    `command -v java >/dev/null 2>&1 || fail "Java $JAVA_MIN or newer is needed to run Minecraft $MC_VERSION, but Java was not found on this computer." "$JAVA_HELP"${more('java')}`,
    `JAVA_RAW=$(java -version 2>&1 | sed -n 's/.* version "\\([^"]*\\)".*/\\1/p' | head -n 1)`,
    'JAVA_MAJOR=${JAVA_RAW%%[!0-9]*}',
    'if [ "$JAVA_MAJOR" = "1" ]; then',
    '  JAVA_REST=${JAVA_RAW#1.}',
    '  JAVA_MAJOR=${JAVA_REST%%[!0-9]*}',
    'fi',
    'case "$JAVA_MAJOR" in',
    `  ''|*[!0-9]*) fail "Could not tell which Java version is installed." "$JAVA_HELP"${more('java')} ;;`,
    'esac',
    `[ "$JAVA_MAJOR" -ge "$JAVA_MIN" ] || fail "Minecraft $MC_VERSION needs Java $JAVA_MIN or newer, but this computer has Java $JAVA_MAJOR." "$JAVA_HELP"${more('java')}`,
    '',
    "# ----- 2. Server jar: shared per-user cache, checked against Mojang's sha1 -----",
    'sha1_of() {',
    '  if command -v sha1sum >/dev/null 2>&1; then sha1sum "$1" | cut -d " " -f 1',
    '  elif command -v shasum >/dev/null 2>&1; then shasum -a 1 "$1" | cut -d " " -f 1',
    `  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha1 "$1" | sed 's/^.*= *//'`,
    '  else return 1',
    '  fi',
    '}',
    'have_good() { [ -f "$1" ] && [ "$(sha1_of "$1" 2>/dev/null)" = "$JAR_SHA1" ]; }',
    'if [ -n "$MCSM_CACHE_DIR" ]; then CACHE="$MCSM_CACHE_DIR"',
    'elif [ "$(uname -s)" = "Darwin" ]; then CACHE="$HOME/Library/Caches/MinecraftServerMaker/jars"',
    'else CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/MinecraftServerMaker/jars"',
    'fi',
    'mkdir -p "$CACHE" 2>/dev/null || { CACHE="$PWD/.jar-cache"; mkdir -p "$CACHE" || fail "Could not create a folder to save the server in."; }',
    'CJAR="$CACHE/$JAR_SHA1.jar"',
    'PART="$CACHE/$JAR_SHA1.part"',
    'fetch_jar() {',
    '  if command -v curl >/dev/null 2>&1; then',
    '    if [ "$1" = 1 ]; then curl -L --fail --retry 3 --retry-delay 2 -C - -o "$PART" "$JAR_URL"',
    '    else rm -f "$PART"; curl -L --fail --retry 3 --retry-delay 2 -o "$PART" "$JAR_URL"',
    '    fi',
    '  elif command -v wget >/dev/null 2>&1; then',
    '    rm -f "$PART"; wget -O "$PART" "$JAR_URL"',
    '  else',
    '    return 2',
    '  fi',
    '}',
    'if have_good server.jar; then',
    '  :',
    'else',
    '  if [ -f "$CJAR" ] && ! have_good "$CJAR"; then',
    '    echo "The saved copy is damaged. Downloading it again."',
    '    rm -f "$CJAR"',
    '  fi',
    '  if [ ! -f "$CJAR" ]; then',
    '    echo "Downloading Minecraft server $MC_VERSION from Mojang, about $JAR_MB MB. This only happens the first time."',
    `    { fetch_jar 1 || fetch_jar 0; } || fail "" "Could not download the server from Mojang. Check your internet connection and run this file again."${more('download')}`,
    `    have_good "$PART" || { rm -f "$PART"; fail "" "The download did not match Mojang's checksum, so it was thrown away." "Check your internet connection and run this file again."${more('download')}; }`,
    '    mv -f "$PART" "$CJAR"',
    '  fi',
    '  cp -f "$CJAR" server.jar',
    'fi',
    '',
    ...(players ? [...playersSh(more('players')), ''] : []),
    '# ----- 4. Start -----',
    'echo',
    'echo "Starting the server. Type stop in the server window to shut it down."',
    '# JVM_ARGS and JAR_ARGS are fixed tokens validated when this file was made; splitting is intended.',
    'java $JVM_ARGS -jar server.jar $JAR_ARGS',
    'echo',
    'echo "The server has stopped."',
    'pause_and_exit 0',
  ];
  return L.join('\n') + '\n';
}

export { ADOPTIUM as adoptiumUrl };
