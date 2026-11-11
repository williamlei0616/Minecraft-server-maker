// The README.txt that goes in every bundle. Plain language: the reader is often a young,
// first-time server owner. It is written in the language of the page the bundle came from;
// the start scripts' console messages stay English.
import { adoptiumUrl } from './scripts';
import type { BundleLocale } from './types';

export interface ReadmeInput {
  versionId: string;
  javaMajor: number;
  jarMegabytes: number;
  port: number;
  /** '' or a validated username. */
  opUsername: string;
  gui: boolean;
  /** Whether eula.txt says eula=true (the player ticked the box). */
  eulaAccepted: boolean;
  /** true = only the allow list, the owner and operators can join. */
  whitelist?: boolean;
  /** How many names are on the allow list / block list and how many addresses are blocked. */
  allowedCount?: number;
  blockedCount?: number;
  blockedIpCount?: number;
  /** Folder name of the map the player will copy in, if they picked one. */
  mapFolder?: string;
  /** The site's help page in the same language, if known. */
  helpUrl?: string;
}

const hasLists = (i: ReadmeInput): boolean =>
  i.whitelist === true ||
  (i.allowedCount ?? 0) > 0 ||
  (i.blockedCount ?? 0) > 0 ||
  (i.blockedIpCount ?? 0) > 0;

const EULA_URL = 'https://aka.ms/MinecraftEULA';

function english(i: ReadmeInput): string[] {
  const title = `Minecraft ${i.versionId} server`;
  const lines = [
    title,
    '='.repeat(title.length),
    'Made with Minecraft Server Maker.',
    '',
    'HOW TO START',
    '  1. Unzip this folder somewhere you can find it again.',
    '  2. Windows:      double-click  start.bat',
    '     Mac / Linux:  open a terminal in this folder and run:  sh start.sh',
    `  3. The first time, it downloads the server from Mojang (about ${i.jarMegabytes} MB) and`,
    '     checks it is the real file. After that it starts. Wait for the word "Done".',
    i.gui
      ? '  4. A server window opens. Leave it open while people play. Type  stop  to shut down.'
      : '  4. Leave the window open while people play. Type  stop  and press Enter to shut down.',
    '',
    'JOINING',
    '  In Minecraft, open Multiplayer, Add Server, and use the address:  localhost',
    "  (Friends on your home Wi-Fi use your computer's local IP address instead.",
    `  Friends over the internet need port ${i.port} forwarded on your router.)`,
    '',
    'YOU NEED JAVA',
    `  Minecraft ${i.versionId} needs Java ${i.javaMajor} or newer. If start.bat or start.sh says`,
    `  Java is missing, get it free here:  ${adoptiumUrl(i.javaMajor)}`,
    '',
  ];
  if (i.mapFolder) {
    lines.push(
      'YOUR MAP',
      `  Before the first start, copy your map folder "${i.mapFolder}" into this folder, next to`,
      '  start.bat. It is the folder that has level.dat inside. The server then opens that map',
      '  instead of making a new world.',
      '  Keep a copy of your original map. If it was made with an older Minecraft, the server',
      '  upgrades it, and that cannot be undone.',
      '',
    );
  }
  if (i.opUsername !== '') {
    lines.push(
      'COMMANDS (OPERATOR)',
      `  The start file makes "${i.opUsername}" an operator the first time it runs, so you can use`,
      '  commands. If that did not work (no internet at that moment), type this in the server',
      `  window once:  op ${i.opUsername}`,
      '',
    );
  }
  if (hasLists(i)) {
    lines.push('WHO CAN JOIN');
    if (i.whitelist) {
      lines.push(
        `  Only people on your allow list (${i.allowedCount ?? 0} names), you and operators can join.`,
      );
    }
    if ((i.blockedCount ?? 0) > 0) lines.push(`  ${i.blockedCount} blocked names can never join.`);
    if ((i.blockedIpCount ?? 0) > 0)
      lines.push(`  ${i.blockedIpCount} blocked IP addresses can never connect.`);
    lines.push(
      '  The first time you start, start.bat / start.sh looks the names up with Mojang and writes',
      '  whitelist.json, banned-players.json and banned-ips.json. Files you already have are kept.',
      '  A name it cannot find is printed in the window; the server still starts.',
      '  Later, change the lists by typing in the server window, for example:',
      '    whitelist add NAME     whitelist remove NAME     ban NAME     pardon NAME',
      '    ban-ip ADDRESS     pardon-ip ADDRESS',
      '',
    );
  }
  lines.push(
    'THE MINECRAFT EULA',
    ...(i.eulaAccepted
      ? [
          `  You accepted the Minecraft EULA (${EULA_URL}) on the Minecraft Server`,
          '  Maker page, which is why eula.txt says eula=true. Delete eula.txt or set it to false',
          '  if you do not agree.',
        ]
      : [
          `  Minecraft will not run until you accept its EULA (${EULA_URL}).`,
          '  Read it, then open eula.txt and change eula=false to eula=true.',
        ]),
    '',
    'IF WINDOWS OR macOS WARNS ABOUT THE START FILE',
    '  It is a plain text file from the internet. You can open it in Notepad / TextEdit and',
    '  read exactly what it does. On Windows choose "More info" then "Run anyway".',
    '',
  );
  if (i.helpUrl) lines.push('MORE HELP', `  ${i.helpUrl}`, '');
  lines.push('This is an unofficial tool. Not affiliated with Mojang or Microsoft.', '');
  return lines;
}

function traditionalChinese(i: ReadmeInput): string[] {
  const title = `Minecraft ${i.versionId} 伺服器`;
  const lines = [
    title,
    '='.repeat(title.length + 4),
    '由 Minecraft Server Maker 製作。',
    '',
    '如何啟動',
    '  1. 先把這個資料夾解壓縮到容易找到的地方。',
    '  2. Windows：連按兩下  start.bat',
    '     Mac / Linux：在這個資料夾開啟終端機，輸入：sh start.sh',
    `  3. 第一次會從 Mojang 下載伺服器（約 ${i.jarMegabytes} MB），並檢查檔案是否正版。`,
    '     之後才會啟動。請等到出現「Done」。',
    i.gui
      ? '  4. 會開啟伺服器視窗。大家在玩的時候請保持開著，要關閉時輸入  stop。'
      : '  4. 大家在玩的時候請保持視窗開著，要關閉時輸入  stop  再按 Enter。',
    '',
    '如何加入',
    '  在 Minecraft 開啟「多人遊戲」，選「新增伺服器」，位址輸入：localhost',
    '  （同一個 Wi-Fi 的朋友，請改用你電腦的區域網路 IP 位址。',
    `  網路上的朋友，需要在路由器上轉發連接埠 ${i.port}。）`,
    '',
    '需要 Java',
    `  Minecraft ${i.versionId} 需要 Java ${i.javaMajor} 或更新的版本。如果 start.bat 或 start.sh`,
    `  說找不到 Java，請到這裡免費下載：${adoptiumUrl(i.javaMajor)}`,
    '',
  ];
  if (i.mapFolder) {
    lines.push(
      '你的地圖',
      `  第一次啟動之前，請把你的地圖資料夾「${i.mapFolder}」複製到這個資料夾裡，放在 start.bat`,
      '  旁邊。它就是裡面有 level.dat 的那個資料夾。之後伺服器會開啟這張地圖，而不是建立新世界。',
      '  請保留一份原始地圖的備份。如果地圖是用較舊的 Minecraft 製作的，伺服器會升級它，而且無法還原。',
      '',
    );
  }
  if (i.opUsername !== '') {
    lines.push(
      '指令權限（管理員）',
      `  啟動檔案第一次執行時，會讓「${i.opUsername}」成為管理員（OP），這樣你就能使用指令。`,
      '  如果沒有成功（當時沒有網路），請在伺服器視窗輸入一次：',
      `  op ${i.opUsername}`,
      '',
    );
  }
  if (hasLists(i)) {
    lines.push('誰可以加入');
    if (i.whitelist) {
      lines.push(`  只有允許名單上的人（${i.allowedCount ?? 0} 個名字）、你自己和管理員可以加入。`);
    }
    if ((i.blockedCount ?? 0) > 0) lines.push(`  ${i.blockedCount} 個被封鎖的名字永遠無法加入。`);
    if ((i.blockedIpCount ?? 0) > 0)
      lines.push(`  ${i.blockedIpCount} 個被封鎖的 IP 位址永遠無法連線。`);
    lines.push(
      '  第一次啟動時，start.bat / start.sh 會向 Mojang 查詢這些名字，並寫入',
      '  whitelist.json、banned-players.json 和 banned-ips.json。已經存在的檔案會保留。',
      '  找不到的名字會顯示在視窗中，伺服器仍會啟動。',
      '  之後要修改名單，請在伺服器視窗輸入，例如：',
      '    whitelist add 名字     whitelist remove 名字     ban 名字     pardon 名字',
      '    ban-ip 位址     pardon-ip 位址',
      '',
    );
  }
  lines.push(
    'MINECRAFT 使用者授權（EULA）',
    ...(i.eulaAccepted
      ? [
          `  你已在 Minecraft Server Maker 頁面同意 Minecraft EULA（${EULA_URL}），`,
          '  所以 eula.txt 內寫著 eula=true。如果你不同意，請刪除 eula.txt，或把它改成 false。',
        ]
      : [
          `  在你同意 Minecraft 的 EULA（${EULA_URL}）之前，伺服器不會執行。`,
          '  請先閱讀，再開啟 eula.txt，把 eula=false 改成 eula=true。',
        ]),
    '',
    '如果 Windows 或 macOS 對啟動檔案發出警告',
    '  它只是從網路下載的純文字檔，你可以用記事本 / 文字編輯開啟，看清楚它做了什麼。',
    '  在 Windows 請選「其他資訊」，再選「仍要執行」。',
    '',
  );
  if (i.helpUrl) lines.push('更多說明', `  ${i.helpUrl}`, '');
  lines.push('這是非官方工具，與 Mojang 或 Microsoft 無關。', '');
  return lines;
}

/**
 * The README as the exact text for README.txt. Windows editors read it best with CRLF line
 * endings, and non-English text needs a byte order mark so older Notepad versions do not show
 * garbage. English stays plain ASCII.
 */
export function renderReadme(i: ReadmeInput, locale: BundleLocale = 'en'): string {
  const lines = locale === 'zh-hant' ? traditionalChinese(i) : english(i);
  const body = lines.join('\r\n');
  // Anything beyond plain ASCII (a Chinese map name, say) needs the byte order mark too.
  // eslint-disable-next-line no-control-regex
  return locale === 'en' && /^[\u0000-\u007f]*$/.test(body) ? body : '\uFEFF' + body;
}
