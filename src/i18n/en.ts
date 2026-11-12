// English text for the whole site. This is the reference: other languages mirror its shape.
import type { Messages } from './messages';

export const en: Messages = {
  meta: {
    title: 'Minecraft Server Builder',
    description:
      'Pick your options, download a small zip, double-click one file. Your Minecraft server starts with your settings.',
    helpTitle: 'Help · Minecraft Server Builder',
    helpDescription:
      'Fixes for the most common problems when starting a Minecraft server: Java, the window that closes, friends who cannot join and more.',
  },
  site: {
    name: 'Minecraft Server Builder',
    reassure: 'Every answer is already filled in. Change only what you want.',
    phoneNote:
      'You can look around on a phone, but the download is made for a computer. Open this page on your PC or Mac to play.',
    skip: 'Skip to the questions',
    footer:
      'Not affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB. The zip never contains the game: the start script downloads it from Mojang on your computer and checks it is genuine.',
    eulaLink: 'Minecraft EULA',
    help: 'Help',
    language: 'Language',
  },
  langNotice: {
    text: 'This page is also available in Traditional Chinese.',
    link: '繁體中文',
    dismiss: 'Dismiss',
  },
  steps: {
    basics: {
      title: 'Basics',
      intro: 'Just what every server needs. Everything else already has a good answer.',
    },
    gameplay: {
      title: 'Gameplay',
      intro: 'How the world plays. Skip this page if the defaults are fine.',
    },
    players: {
      title: 'Players',
      intro: 'Who may join your server. Safe to skip: by default anyone with the address can join.',
    },
    advanced: { title: 'Advanced', intro: 'For people who know their way around. Safe to skip.' },
    review: {
      title: 'Review + download',
      intro: 'Check your answers, accept the EULA, then download.',
    },
  },
  stepbar: { aria: 'Steps', bad: ' has answers to fix', done: ' done' },
  runhead: {
    step: 'Step {n} of {total}',
    questionsLong: 'Questions {from} to {to} of {total}',
    questionsShort: '{from} to {to} of {total}',
  },
  questions: {
    versionId: {
      title: 'Which version do you want?',
      help: 'Friends need the same version to join. The newest is best for a new world. Versions older than 1.18.2 are not offered yet.',
    },
    ramGb: {
      title: 'How much memory should it use?',
      help: 'Type a number of GB. Use less than your computer has free. 4 is a good start; more is not always better.',
      unit: 'GB',
    },
    gui: {
      title: 'Show the server window?',
      help: 'The window shows chat and who is online. Choose No window to run it quietly.',
      options: { yes: 'Show it', no: 'No window' },
    },
    opUsername: {
      title: 'What is your Minecraft username?',
      help: 'This makes you the boss (an operator). You can skip it. Only your own computer looks the name up.',
      placeholder: 'Optional',
    },
    gamemode: {
      title: 'What is the game mode?',
      help: 'Survival is the classic game: gather, build and stay alive.',
      options: {
        survival: 'Survival',
        creative: 'Creative',
        adventure: 'Adventure',
        spectator: 'Spectator',
      },
    },
    difficulty: {
      title: 'How tough are the monsters?',
      help: 'Peaceful means no monsters at all.',
      options: { peaceful: 'Peaceful', easy: 'Easy', normal: 'Normal', hard: 'Hard' },
    },
    hardcore: {
      title: 'Do you want Hardcore?',
      help: 'You get one life only. If you are new, choose No.',
      options: { yes: 'Yes', no: 'No' },
    },
    pvp: {
      title: 'Can players fight each other?',
      help: 'This is called PvP. Choose No for a friendly world.',
      options: { yes: 'Yes', no: 'No' },
    },
    commandBlocks: {
      title: 'Allow command blocks?',
      help: 'They are for redstone and map makers. Most worlds do not need them.',
      options: { yes: 'Yes', no: 'No' },
    },
    maxPlayers: {
      title: 'How many players at most?',
      help: 'Pick a number from 1 to 100.',
      unit: 'players',
    },
    motd: {
      title: 'What is your server called?',
      help: 'Friends see this name in their server list. Up to 60 letters.',
    },
    seed: {
      title: 'Do you want a world seed?',
      help: 'The same seed makes the same world. Leave it empty for a random one.',
      placeholder: 'Empty means random',
    },
    viewDistance: {
      title: 'How far can players see?',
      help: 'Chunks drawn around each player. Lower is easier on slow computers.',
      unit: 'chunks',
    },
    simulationDistance: {
      title: 'How far does the world keep moving?',
      help: 'Plants grow and animals move only this close to a player.',
      unit: 'chunks',
    },
    whitelist: {
      title: 'Who can join?',
      help: 'Anyone with your address, or only the people you list. A list is safer if friends will join over the internet.',
      options: { anyone: 'Anyone', list: 'Only people on my list' },
    },
    allowedPlayers: {
      title: 'Which players may join?',
      help: 'Type one Minecraft username on each line. Names are looked up with Mojang the first time you start the server.',
      placeholder: 'One name per line',
    },
    blockedPlayers: {
      title: 'Anyone to keep out?',
      help: 'These usernames can never join, even if the server is open to everyone. You can skip this.',
      placeholder: 'One name per line',
    },
    blockedIps: {
      title: 'Any addresses to block?',
      help: 'Computers with these IP addresses can never connect. Most people leave this empty.',
      placeholder: 'One address per line',
    },
    port: {
      title: 'Which port should it use?',
      help: 'The door friends knock on. Keep 25565 unless you know you need another.',
    },
    allowFlight: {
      title: 'Allow flying?',
      help: 'Needed by some mods and maps. Normal players cannot fly in Survival.',
      options: { yes: 'Yes', no: 'No' },
    },
    map: {
      title: 'Do you want to play on your own map?',
      help: 'Optional. Pick the map folder, or a .zip of it. The map is only read on your computer; nothing is uploaded. After the download you copy the map folder next to the start file yourself.',
    },
    extraProperties: {
      title: 'Anything else you want to change?',
      help: 'This is the whole server.properties file for your version. Edit any line. Only the lines you change are kept, so changing your answers on other pages still works. Delete a line to put it back to normal.',
    },
    spawnProtection: {
      title: 'How big is the safe spawn area?',
      help: 'Only operators can build inside it. 0 turns it off.',
      unit: 'blocks',
    },
  },
  labels: {
    versionId: 'Version',
    ramGb: 'Memory',
    gui: 'Server window',
    opUsername: 'Your username',
    gamemode: 'Game mode',
    difficulty: 'Difficulty',
    hardcore: 'Hardcore',
    pvp: 'Players can fight',
    commandBlocks: 'Command blocks',
    maxPlayers: 'Most players',
    motd: 'Server name',
    seed: 'World seed',
    viewDistance: 'View distance',
    simulationDistance: 'Simulation distance',
    port: 'Port',
    allowFlight: 'Flying allowed',
    spawnProtection: 'Safe spawn area',
    whitelist: 'Who can join',
    allowedPlayers: 'Allowed players',
    blockedPlayers: 'Blocked players',
    blockedIps: 'Blocked addresses',
    extraProperties: 'Edited settings',
    map: 'Custom map',
  },
  version: {
    placeholder: 'Type to search, like 1.21',
    toggle: 'Also search test versions (snapshots). They can crash.',
    none: 'No version matches “{text}”. Try 1.21 or 26.',
    newest: 'newest',
    test: 'test version',
    listAria: 'Minecraft versions',
    matchOne: '{n} version matches',
    matchMany: '{n} versions match',
    loading: 'Loading the list of Minecraft versions…',
    failed: 'The version list did not load. Check your internet.',
    retry: 'Try again',
  },
  notes: {
    hardcore: 'Hardcore always plays on Hard, so the other levels are crossed out.',
    ramHigh: 'Most home computers have 8 to 16 GB in total. Check yours before choosing this much.',
    ramLow: '1 GB is very small. It is fine for one or two players.',
    gameRule:
      'This version moved this setting into the game itself, so this page cannot set it. An operator can change it in the game with the /gamerule command.',
    notInVersion: 'This version does not have this setting.',
    listOff:
      'Anyone can join, so this list is not used. Choose “Only people on my list” above to use it.',
    ownerAdded: 'You ({name}) are let in automatically.',
    listOne: '1 name',
    listMany: '{n} names',
    seedMap: 'Your map already has its own world, so the seed is not used.',
    setInEditor:
      'You changed this in the settings file (the last question on this page), so that value is used.',
    ipsOne: '1 address',
    ipsMany: '{n} addresses',
  },
  errors: {
    version: 'Pick one of the versions in the list.',
    choice: 'Pick one of the choices.',
    onoff: 'Choose on or off.',
    range: 'Type a whole number from {min} to {max}.',
    blank: 'Give your server a name, or friends will see a blank.',
    tooLong: 'Keep this under {max} characters.',
    username: 'Use 3 to 16 letters, numbers or underscores. No spaces.',
    listName: '“{value}” is not a Minecraft username (3 to 16 letters, numbers or underscores).',
    listTooMany: 'Keep this list to {max} entries or fewer.',
    listDuplicate: '“{value}” is on this list twice.',
    listOverlap: '“{value}” is on both lists.',
    blockOwner: 'You cannot block your own username.',
    ipInvalid: '“{value}” is not an IP address.',
    mapName: '“{value}” cannot be used as a folder name.',
    extraKey: '“{value}” is not a usable setting name.',
    extraValue: 'The value of “{value}” is not usable.',
    extraTooMany: 'Keep the edited lines to {max} or fewer.',
    extraFix: 'Fix the lines marked in the editor ({n}).',
    whitelistEmpty:
      'Add at least one name, or give your own username on the first page. Otherwise nobody could join.',
  },
  map: {
    pickFolder: 'Choose map folder…',
    pickZip: 'Choose a .zip file…',
    remove: 'Remove the map',
    reading: 'Reading the map…',
    folderLabel: 'Folder to copy',
    gameName: 'Name in the game',
    savedIn: 'Last saved in Minecraft',
    veryOld: 'a very old version (before 1.9)',
    unknown: 'an unknown version',
    aNewerOne: 'a newer version',
    verdictOk: 'This map works with {server}.',
    verdictOlder:
      'This map is older than {server}. Minecraft upgrades it the first time the server opens it, and that cannot be undone. Keep a copy of your original map.',
    verdictNewer:
      'This map was last saved in Minecraft {mapVersion}, which is newer than {server}. The server cannot open it. Choose {mapVersion} or newer in the first question, or pick another map.',
    verdictUnknown: 'Checking this map against {server}…',
    inside: 'The map was found inside “{path}”. Copy the folder “{folder}”, not the outer one.',
    zipRoot:
      'The zip has the map files at the top. After unzipping, put them in a new folder called “{folder}”.',
    others: 'More than one map was found. The first one is used.',
    notSaved: 'This page does not remember your map. If you reload, choose it again.',
    fail: {
      noLevelDat:
        'No level.dat was found. Choose the map’s own folder: the one with level.dat inside.',
      notJava:
        'That does not look like a Minecraft Java Edition map. Bedrock Edition maps do not work here.',
      damaged: 'The level.dat file is damaged, so the map cannot be read.',
      tooBig: 'The level.dat file is unusually large, so it was not opened.',
      notZip: 'That file could not be opened as a zip.',
      failed: 'The map could not be read.',
      zipTooBig:
        'That zip is {mb} MB, too big for the browser to read. Unzip it and choose the folder instead.',
      badName:
        '“{name}” cannot be used as a folder name on every computer (no slashes, no : * ? " | or angle brackets, no space or dot at the end, at most 64 characters). Rename the folder and choose it again.',
    },
  },
  editor: {
    waiting: 'Loading the settings of this version…',
    import: 'Import my server.properties…',
    reset: 'Undo all my edits',
    countNone: 'No edits yet',
    countOne: '1 line changed',
    countMany: '{n} lines changed',
    line: 'Line {n}',
    draftNote:
      'Lines that are not key=value, or repeat a setting, are left out when you click away.',
    dropNote:
      'You can also drop a server.properties file onto the box. Only the lines that differ from your answers are kept.',
    secretsNote:
      'Passwords and secrets stay in your download but are never put in a share link or saved in this browser.',
    imported: 'Imported: {n} settings differ from your answers.',
    importedLeft: '{n} not used by this version and left out: {keys}.',
    importFailed: 'That file could not be read.',
    importTooBig: 'That file is too big to be a server.properties.',
    issues: {
      syntax: 'This is not a “key=value” line, so it is left out: {key}',
      duplicate: '“{key}” appears twice. Only the first one is used.',
      unknownKey: '“{key}” is not a setting in this version. Delete the line.',
      volatile: '“{key}” is made fresh by the server every time, so it is never written.',
      tooLong: 'The value of “{key}” is too long (at most {max} characters).',
      notBoolean: '“{key}” must be true or false.',
      notInteger: '“{key}” must be a whole number.',
      outOfRange: '“{key}” must be a whole number from {min} to {max}.',
      notOneOf: '“{key}” must be one of: {options}.',
      locked: '“{key}” is set by your map, so it cannot be changed here.',
      riskOnlineMode:
        'Careful: with online-mode=false anyone can join under any name, including the name of an operator.',
      riskRcon:
        'Careful: remote console lets a program control your server with a password. Only turn it on if you know why.',
      riskJmx: 'Careful: JMX monitoring opens a way to manage the server from other programs.',
      riskManagement:
        'Careful: the management server lets other programs control your server. Only change it if you know why.',
      riskServerIp:
        'Careful: server-ip makes the server listen on that address only. Friends cannot join if it is wrong.',
      riskCompression:
        'Careful: a wrong network-compression-threshold can make joining slow or fail.',
    },
  },
  nav: { previous: 'Previous: {name}', next: 'Next: {name}', review: 'Review + download' },
  card: {
    title: 'Your server',
    rowVersion: 'Version',
    rowRules: 'Rules',
    rowMemory: 'Memory',
    rowWindow: 'Window',
    rowPlayers: 'Players',
    shown: 'Shown',
    hidden: 'None',
    upTo: 'up to {n}',
    java: 'Needs Java {n} or newer. The start script checks it for you and says where to get it: <adoptium>Java {n} download</adoptium>.',
    loadingVersions: 'Loading versions…',
    listMissing: 'The version list is missing.',
    fixOne: '1 answer to fix.',
    fixMany: '{n} answers to fix.',
    allFine: 'All your answers are fine.',
    reviewButton: 'Review + download',
    downloadTitle: 'Download',
    eula: 'I have read and accept the Minecraft EULA',
    readEula: 'Read the EULA',
    downloadButton: 'Download zip',
    packing: 'Packing your zip…',
    whyList: 'Download waits for the version list.',
    whyDetails: 'Download waits for the details of this version.',
    whyDetailsFailed: 'We could not load the details of this version.',
    whyRetry: 'Try again',
    whyFix: 'Fix question <fix>{n}</fix> first.',
    whyEula: 'Tick the EULA box to download.',
    buildFailed: 'We could not make your zip. Please try again.',
    hardcoreSuffix: 'Hardcore',
    listSep: ', ',
  },
  done: {
    title: 'Your zip is downloading',
    made: '<code>{name}</code> is in your Downloads folder.',
    step1:
      '<b>Unzip it.</b> Right-click the file and choose Extract all (Windows), or double-click it (Mac).',
    step2:
      '<b>Run it.</b> Open the new folder and double-click <code>start.bat</code> on Windows. On Mac and Linux, open a terminal in the folder and type <code>sh start.sh</code>. The first start downloads the game for you.',
    step3:
      '<b>Join.</b> In Minecraft choose Multiplayer, then Add Server, and type <code>localhost</code>.',
    operator:
      'The first start also makes <b>{name}</b> an operator, so you can use commands. That needs the internet once. If it does not work, type <code>op {name}</code> in the server window.',
    java: 'Needs Java {n} or newer. The start script checks it for you and says where to get it: <adoptium>Java {n} download</adoptium>.',
    map: 'Before you start, copy your map folder <b>{folder}</b> into the new server folder, next to <code>start.bat</code>.',
    again: 'Download again',
    change: 'Change my answers',
    help: 'Something went wrong? <help>Open the help page</help>.',
  },
  review: {
    problemsOne: '1 answer to fix before you can download',
    problemsMany: '{n} answers to fix before you can download',
    problemLink: 'Question {n}: {title}',
    change: 'Change',
    shareTitle: 'Share these answers',
    shareText:
      'Anyone who opens this link sees the same answers filled in. It does not include the EULA tick, and nothing is stored on our side: the answers are inside the link itself. The link includes the names you typed, so only send it to people you trust.',
    shareAria: 'Share link',
    copy: 'Copy link',
    copied: 'Copied. Paste it in a message.',
    copyFailed: 'Your browser would not copy it. Select the link above and copy it by hand.',
    notAvailable: 'Not available in this version',
    random: 'Random',
    notSet: 'Not set',
    empty: 'Empty',
    none: 'None',
    notUsed: 'Not used (anyone can join)',
    notUsedMap: 'Not used (your map has its own world)',
    rememberLabel: 'Remember my answers on this computer',
    rememberHelp:
      'Next time you open this page your answers are already filled in. They are kept in this browser only, including any usernames you typed, and never the EULA tick, a map or passwords. Turn this off to delete them.',
    filesTitle: 'See the files in your zip',
    filesIntro:
      'These are the exact files you will get, so you can read every line before you run anything. The server itself is not in the zip: the start file downloads it from Mojang and checks it.',
    filesWaiting:
      'The files appear here once your answers are valid and this version’s settings have loaded.',
    filesLines: '{n} lines',
    edited: '(edited)',
    extraNone: 'Nothing changed',
    extraOne: '1 setting changed',
    extraMany: '{n} settings changed',
  },
  notice: {
    shared: 'The answers from the link are filled in. Check them, then accept the EULA yourself.',
    badShare: 'That link could not be read, so the form starts with its normal answers.',
    dismiss: 'Dismiss',
  },
  help: {
    backToBuilder: 'Back to the builder',
    intro: 'Fixes for the problems people hit most often. Pick the one that matches what you see.',
    toc: 'On this page',
    javaTableTitle: 'Which Java each Minecraft version needs',
    javaTableVersion: 'Minecraft version',
    javaTableJava: 'Java',
    javaTableRange: '{from} to {to}',
    javaTableLoading: 'Loading the table…',
    javaTableFailed: 'The table did not load. The builder page also shows the Java you need.',
    topics: [
      {
        id: 'java',
        title: 'Java is missing, or I do not know what Java is',
        body: [
          'A Minecraft server is a Java program, so your computer needs Java installed. The start file checks this for you and tells you which version you need.',
          'To see what you have: open <b>Command Prompt</b> (Windows) or <b>Terminal</b> (Mac and Linux), type <code>java -version</code> and press Enter. A line like <code>openjdk version "25.0.5"</code> means Java is installed, and the number after the quote is its version. An error means Java is not installed.',
        ],
        steps: [
          'Open the <adoptium>Adoptium download page</adoptium>. It is a free, trusted build of Java.',
          'Choose your operating system and the Java version number from the table below. Pick the <b>JDK</b> and the installer file (<code>.msi</code> on Windows, <code>.pkg</code> on Mac).',
          'Run the installer. If it offers to add Java to the PATH, keep that option selected.',
          'Close your Command Prompt or Terminal window, open a new one, and type <code>java -version</code> again. Then run the start file again.',
        ],
        after: [
          'On Linux your package manager may offer these Java versions; otherwise download the archive from the same page.',
          '<b>It still says Java is missing?</b> Close the window and open a new one: Java is found when a window opens. If that fails, restart the computer. If <code>java -version</code> shows an older number than the table asks for, install the newer Java and open a new window.',
        ],
      },
      {
        id: 'closes',
        title: 'The window closes straight away',
        body: [
          'The start file waits for a key press before it closes, so you can read the message. If the window still disappears, open <b>Command Prompt</b>, go to the server folder (type <code>cd</code> and a space, drag the folder into the window, press Enter) and run <code>start.bat</code>. Whatever it prints is the reason.',
          'The usual reasons are on this page: Java is missing, the download did not finish, or the port is already in use.',
        ],
      },
      {
        id: 'warning',
        title: 'Windows or macOS warns about the start file',
        body: [
          '<b>Windows</b> may say <b>Windows protected your PC</b>. The start file is a plain text file: open it in Notepad to read exactly what it does. If you are happy with it, choose <b>More info</b>, then <b>Run anyway</b>.',
          '<b>Mac:</b> open Terminal in the server folder and type <code>sh start.sh</code>. This runs the text file through the terminal, which normally avoids the "unidentified developer" warning.',
        ],
      },
      {
        id: 'download',
        title: 'The download stopped, or the checksum did not match',
        body: [
          "Run the start file again: it carries on where it stopped. The server file comes from Mojang's own download address and the script checks it against Mojang's checksum, so a damaged or changed file is thrown away instead of used.",
          'If it keeps failing, check your internet, turn off a VPN, and check that a school or work network, or an antivirus, is not blocking <code>piston-data.mojang.com</code> and <code>launcher.mojang.com</code>.',
        ],
      },
      {
        id: 'friends',
        title: 'My friends cannot join',
        body: [
          '<code>localhost</code> only works on the computer that runs the server. Friends need a different address.',
          '<b>Friends on the same Wi-Fi or home network:</b> they need your computer\'s local address. On Windows open Command Prompt, type <code>ipconfig</code> and look for "IPv4 Address" (it looks like 192.168.1.23). On Mac or Linux look in the network settings. Friends type that address in Add Server.',
          "<b>Friends on the internet:</b> your router has to pass incoming connections to your computer. This is called port forwarding: in your router's settings, forward TCP port 25565 (or the port you chose) to your computer's local address. Friends then use your public IP address. Some internet providers do not allow this. Only share the address with people you trust.",
          'Everyone must also use the same Minecraft version as the server.',
        ],
      },
      {
        id: 'port',
        title: 'The port is already in use',
        body: [
          'Another program, often another Minecraft server still running in a hidden window, is using the same port. Close it, or choose a different port in the <b>Advanced</b> step and download again.',
          'Friends then add the new port after the address, like <code>192.168.1.23:25570</code>.',
        ],
      },
      {
        id: 'version',
        title: 'Players see "outdated client" or cannot connect',
        body: [
          'The Minecraft game must be the same version as the server. In the Minecraft Launcher choose an installation for exactly that version: open Installations, choose New installation and pick the version.',
          'The version of your server is shown in the summary on the last step, and in the first lines of the server window.',
        ],
      },
      {
        id: 'world',
        title: 'Where is my world, and how do I stop the server safely?',
        body: [
          'Your world is saved in a folder called <code>world</code> inside the server folder.',
          'To stop the server, type <code>stop</code> in the server window and press Enter, then wait until it closes. This saves everything. Closing the window, or switching the computer off, without doing this can lose recent progress.',
          'To make a backup, stop the server and copy the <code>world</code> folder somewhere safe.',
        ],
      },
      {
        id: 'slow',
        title: 'The server is slow or uses too much memory',
        body: [
          'Try these in order: close other programs; lower <b>View distance</b> and <b>Simulation distance</b> in the Advanced step (10 is the default, 6 is much lighter); give the server a little more memory in the Basics step, but never more than your computer has free; make sure the computer is plugged in and not in power-saving mode.',
        ],
      },
      {
        id: 'rules',
        title: 'Why are PvP and command blocks crossed out?',
        body: [
          'From Minecraft 1.21.9 these two settings moved from the server settings file into the game itself, so this page cannot change them. As an operator you can change them in the game with the <code>/gamerule</code> command.',
          'If you need this page to set them, pick version 1.21.8 or older.',
        ],
      },
      {
        id: 'players',
        title: 'How do the allow list and the block list work?',
        body: [
          'The allow list means only the names you list, and you, can join. The block list keeps named players out for good, and a blocked address keeps a computer out.',
          'The first time you start the server, the start file looks each name up with Mojang (it needs the internet for a moment) and writes <code>whitelist.json</code>, <code>banned-players.json</code> and <code>banned-ips.json</code>. A name it cannot find is printed in the window, and the server still starts.',
          'If the allow list is on and no name could be looked up, the start file stops instead of starting a server nobody can join. Check your internet and run it again.',
        ],
        after: [
          'Files you already have are never overwritten. To change a list later, type in the server window: <code>whitelist add NAME</code>, <code>whitelist remove NAME</code>, <code>ban NAME</code>, <code>pardon NAME</code>, <code>ban-ip ADDRESS</code> or <code>pardon-ip ADDRESS</code>.',
        ],
      },
      {
        id: 'map',
        title: 'How do I use my own map?',
        body: [
          'In the Gameplay step, choose your map folder (or a .zip of it). The page reads only one small file, <code>level.dat</code>, on your computer. Nothing is uploaded.',
        ],
        steps: [
          'Download your zip as usual and unzip it.',
          'Copy your map folder (the one with <code>level.dat</code> inside) into the new server folder, next to <code>start.bat</code>.',
          'Run the start file. The server opens your map instead of making a new world.',
        ],
        after: [
          'A map saved by a newer Minecraft than the server cannot be opened: choose that version or newer. An older map is upgraded the first time, and that cannot be undone, so keep a copy. Bedrock Edition maps do not work. Resource packs are not supported yet.',
        ],
      },
      {
        id: 'editor',
        title: 'What does the settings editor do, and is it safe?',
        body: [
          'The last question on the Advanced step shows the whole <code>server.properties</code> file for your version. Edit any line, or drop your old file onto the box to import it.',
          'Only the lines you change are kept. Change an answer on another page and the file follows, except for the lines you edited yourself. Delete a line to put it back to normal.',
          'Lines this version does not have, or values of the wrong kind (text where a number is needed), are marked and must be fixed before you can download. A few settings show a “Careful” warning, for example <code>online-mode=false</code>, which lets anyone join under any name.',
        ],
        after: [
          'Passwords (like <code>rcon.password</code>) stay in your download but are never put in the share link or saved in your browser.',
        ],
      },
      {
        id: 'eula',
        title: 'What is the EULA?',
        body: [
          "The EULA is Mojang's license for running Minecraft servers. Minecraft refuses to start a server until someone agrees to it.",
          'This page only writes <code>eula=true</code> into your download if you tick the box yourself. Read it first at <eula>aka.ms/MinecraftEULA</eula>. You can change your mind later by deleting <code>eula.txt</code> or setting it to <code>false</code>.',
        ],
      },
    ],
  },
};
