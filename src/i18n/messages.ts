// The shape of all text on the site. English (en.ts) and every other language must fill in
// exactly this: TypeScript rejects a missing or extra string, and a test checks that the
// {placeholders} and <tags> inside each string match the English one.
//
// Placeholders: {name} is replaced by a value. Tags: <b>, <code> and named link tags such as
// <adoptium>...</adoptium> wrap text that should be bold, monospace or a link. Numbers, version
// ids, file names and commands are never translated.
import type { IssueCode } from '@/core';
import type { QuestionId } from '@/ui/questions';
import type { StepId } from '@/ui/steps';

export interface QuestionText {
  title: string;
  help: string;
  placeholder?: string;
  unit?: string;
  /** Labels for the answers of a multiple-choice question, by answer value. */
  options?: Record<string, string>;
}

export type HelpTopicId =
  | 'java'
  | 'closes'
  | 'warning'
  | 'download'
  | 'friends'
  | 'port'
  | 'version'
  | 'world'
  | 'slow'
  | 'rules'
  | 'players'
  | 'map'
  | 'editor'
  | 'eula';

export interface HelpTopic {
  id: HelpTopicId;
  title: string;
  /** Paragraphs shown first. */
  body: string[];
  /** A numbered list, if the topic has steps. */
  steps?: string[];
  /** Paragraphs shown after the steps (and after the Java table, for the Java topic). */
  after?: string[];
}

export interface Messages {
  meta: { title: string; description: string; helpTitle: string; helpDescription: string };
  site: {
    name: string;
    reassure: string;
    phoneNote: string;
    skip: string;
    footer: string;
    eulaLink: string;
    help: string;
    language: string;
  };
  langNotice: { text: string; link: string; dismiss: string };
  steps: Record<StepId, { title: string; intro: string }>;
  stepbar: { aria: string; bad: string; done: string };
  runhead: { step: string; questionsLong: string; questionsShort: string };
  questions: Record<QuestionId, QuestionText>;
  labels: Record<QuestionId, string>;
  version: {
    placeholder: string;
    toggle: string;
    none: string;
    newest: string;
    test: string;
    listAria: string;
    matchOne: string;
    matchMany: string;
    loading: string;
    failed: string;
    retry: string;
  };
  notes: {
    hardcore: string;
    ramHigh: string;
    ramLow: string;
    gameRule: string;
    notInVersion: string;
    /** The allow list box is greyed out while "anyone" is chosen. */
    listOff: string;
    /** Under the allow list: you are added automatically. {name} */
    ownerAdded: string;
    listOne: string;
    listMany: string;
    /** Under the seed question while a map is attached. */
    seedMap: string;
    /** Under a question whose setting was changed in the editor. */
    setInEditor: string;
    ipsOne: string;
    ipsMany: string;
  };
  errors: {
    version: string;
    choice: string;
    onoff: string;
    range: string;
    blank: string;
    tooLong: string;
    username: string;
    listName: string;
    listTooMany: string;
    listDuplicate: string;
    listOverlap: string;
    blockOwner: string;
    ipInvalid: string;
    whitelistEmpty: string;
    mapName: string;
    extraKey: string;
    extraValue: string;
    extraTooMany: string;
    /** The editor has lines to fix. {n} */
    extraFix: string;
  };
  map: {
    pickFolder: string;
    pickZip: string;
    remove: string;
    reading: string;
    folderLabel: string;
    gameName: string;
    savedIn: string;
    /** For a map saved before Minecraft 1.9 (no version recorded). */
    veryOld: string;
    unknown: string;
    /** Stands in for the map's version name when the file does not give one. */
    aNewerOne: string;
    verdictOk: string;
    verdictOlder: string;
    verdictNewer: string;
    verdictUnknown: string;
    inside: string;
    zipRoot: string;
    others: string;
    notSaved: string;
    fail: Record<
      | 'noLevelDat'
      | 'notJava'
      | 'damaged'
      | 'tooBig'
      | 'notZip'
      | 'failed'
      | 'zipTooBig'
      | 'badName',
      string
    >;
  };
  editor: {
    waiting: string;
    import: string;
    reset: string;
    countNone: string;
    countOne: string;
    countMany: string;
    /** Prefix of an issue that belongs to a line: "Line {n}". */
    line: string;
    /** Under the box while typing. */
    draftNote: string;
    /** Under the box otherwise. */
    dropNote: string;
    secretsNote: string;
    imported: string;
    importedLeft: string;
    importFailed: string;
    importTooBig: string;
    /** {key}, {min}, {max}, {options} where they apply. */
    issues: Record<IssueCode, string>;
  };
  nav: { previous: string; next: string; review: string };
  card: {
    title: string;
    rowVersion: string;
    rowRules: string;
    rowMemory: string;
    rowWindow: string;
    rowPlayers: string;
    shown: string;
    hidden: string;
    upTo: string;
    java: string;
    loadingVersions: string;
    listMissing: string;
    fixOne: string;
    fixMany: string;
    allFine: string;
    reviewButton: string;
    downloadTitle: string;
    eula: string;
    readEula: string;
    downloadButton: string;
    packing: string;
    whyList: string;
    whyDetails: string;
    whyDetailsFailed: string;
    whyRetry: string;
    whyFix: string;
    whyEula: string;
    buildFailed: string;
    hardcoreSuffix: string;
    /** Between items in a short list, like "Survival, Easy". */
    listSep: string;
  };
  done: {
    title: string;
    made: string;
    step1: string;
    step2: string;
    step3: string;
    operator: string;
    java: string;
    /** Tells the player to copy the map folder in. {folder} */
    map: string;
    again: string;
    change: string;
    help: string;
  };
  review: {
    problemsOne: string;
    problemsMany: string;
    problemLink: string;
    change: string;
    shareTitle: string;
    shareText: string;
    shareAria: string;
    copy: string;
    copied: string;
    copyFailed: string;
    notAvailable: string;
    random: string;
    notSet: string;
    empty: string;
    none: string;
    notUsed: string;
    /** The seed row while a map is attached. */
    notUsedMap: string;
    rememberLabel: string;
    rememberHelp: string;
    filesTitle: string;
    filesIntro: string;
    filesWaiting: string;
    filesLines: string;
    /** After a value that was changed in the settings file. */
    edited: string;
    extraNone: string;
    extraOne: string;
    extraMany: string;
  };
  notice: { shared: string; badShare: string; dismiss: string };
  help: {
    backToBuilder: string;
    intro: string;
    toc: string;
    javaTableTitle: string;
    javaTableVersion: string;
    javaTableJava: string;
    javaTableRange: string;
    javaTableLoading: string;
    javaTableFailed: string;
    topics: HelpTopic[];
  };
}
