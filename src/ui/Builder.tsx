'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// The only seam to the core library: its public API, nothing deeper.
import {
  OPTIONS,
  buildBundle,
  buildBundleFiles,
  checkExtraProperties,
  loadProfile,
  lockedKeys,
  loadVersions,
  planProperties,
  validate,
  type VersionProfile,
  type VersionsFile,
} from '@/core';
import { useI18n } from '@/i18n/I18n';
import { pagePath } from '@/i18n';
import { unavailableNote, unavailableQuestions } from './availability';
import { errorText } from './errors';
import { mapVerdict } from './MapPicker';
import { QuestionRow, type VersionPicker } from './QuestionRow';
import type { MapInfo } from './readMap';
import { Review, type Problem, type ReviewGroup } from './Review';
import { BASE, EULA_URL, LangNotice, SiteFooter, SiteHeader } from './shell';
import { StepBar, type StepState } from './StepBar';
import {
  QUESTIONS,
  TOTAL,
  answerText,
  defaultAnswers,
  parseList,
  questionNumbers,
  toConfig,
  type Answers,
  type Question,
  type QuestionId,
} from './questions';
import { SHARE_PREFIX, decodeShare, encodeShare } from './share';
import { clearRemembered, loadDraft, loadRemembered, saveDraft, saveRemembered } from './storage';
import { STEPS, nextStep, prevStep, stepFromHash, stepIndex, type StepId } from './steps';

const VERSIONS_URL = `${BASE}/versions.json`;

type LoadStatus = 'loading' | 'failed' | 'ready';
type ProfileStatus = 'idle' | 'loading' | 'ready' | 'failed';
type Phase = 'edit' | 'building' | 'done' | 'failed';

/** What the "done" panel needs to remember, so it does not change if the answers are edited. */
interface MadeZip {
  blob: Blob;
  name: string;
  javaMajor: number | undefined;
  opUsername: string;
  mapFolder: string;
}

export function Builder() {
  const { locale, m, t, rich } = useI18n();
  const [versions, setVersions] = useState<VersionsFile | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [answers, setAnswers] = useState<Answers>(() => defaultAnswers(''));
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [eula, setEula] = useState(false);
  const [phase, setPhase] = useState<Phase>('edit');
  const [profile, setProfile] = useState<VersionProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const [profileTry, setProfileTry] = useState(0);
  const [zip, setZip] = useState<MadeZip | null>(null);
  const [mapInfo, setMapInfo] = useState<MapInfo | null>(null);
  const [step, setStep] = useState<StepId>('basics');
  const [visited, setVisited] = useState<ReadonlySet<StepId>>(new Set<StepId>(['basics']));
  const [current, setCurrent] = useState(1);
  const [noticeKind, setNoticeKind] = useState<'shared' | 'badShare' | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');
  const [hydrated, setHydrated] = useState(false);
  const [remember, setRemember] = useState(false);

  const demo = useRef<string | null>(null); // ?state=loading | error, to preview those states
  const lastFocusAt = useRef(0); // focus wins over scroll position for a moment
  const runheadRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const dlRef = useRef<HTMLButtonElement>(null);
  const pendingQuestion = useRef<number | null>(null); // a question to focus once its step is shown
  const firstStepRender = useRef(true);

  /** The help page in the page's language, as a full address (the start scripts print it). */
  const helpHref = `${BASE}${pagePath(locale, 'help')}`;

  /* ---------- versions ---------- */
  const load = useCallback(() => {
    setStatus('loading');
    if (demo.current === 'loading') return;
    if (demo.current === 'error') {
      setTimeout(() => setStatus('failed'), 300);
      return;
    }
    loadVersions(VERSIONS_URL).then(
      (v) => {
        setVersions(v);
        // An empty, saved or shared version that is not in the list falls back to the newest release.
        setAnswers((a) =>
          v.versions.some((x) => x.id === a.versionId) ? a : { ...a, versionId: v.latest.release },
        );
        setStatus('ready');
      },
      () => setStatus('failed'),
    );
  }, []);

  /* ---------- first load: a share link, or the autosaved draft, or nothing ---------- */
  useEffect(() => {
    demo.current = new URLSearchParams(window.location.search).get('state');
    const hash = window.location.hash;
    if (hash.startsWith(SHARE_PREFIX)) {
      decodeShare(hash.slice(SHARE_PREFIX.length)).then((shared) => {
        if (shared) {
          setAnswers((a) => ({ ...a, ...shared }));
          setNoticeKind('shared');
          setVisited(new Set<StepId>(['basics', 'gameplay', 'players', 'advanced']));
          setStep('review');
          window.history.replaceState(null, '', '#review'); // do not leave the long payload in the address bar
        } else {
          setNoticeKind('badShare');
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        setHydrated(true);
      });
    } else {
      const remembered = loadRemembered();
      setRemember(remembered !== null);
      const draft = loadDraft() ?? remembered;
      if (draft) {
        setAnswers((a) => ({ ...a, ...draft.answers }));
        setShowSnapshots(draft.showSnapshots);
      }
      const s = stepFromHash(hash);
      if (s) setStep(s);
      setHydrated(true);
    }
    load();
  }, [load]);

  // A chosen test version needs the test-versions switch on, or the search box could not show it.
  useEffect(() => {
    if (versions?.versions.find((v) => v.id === answers.versionId)?.type === 'snapshot')
      setShowSnapshots(true);
  }, [versions, answers.versionId]);

  // Autosave (sessionStorage; the EULA tick is never saved).
  useEffect(() => {
    if (!hydrated) return;
    saveDraft({ answers, showSnapshots });
    if (remember) saveRemembered({ answers, showSnapshots });
  }, [answers, showSnapshots, hydrated, remember]);

  const toggleRemember = (on: boolean) => {
    setRemember(on);
    if (!on) clearRemembered();
  };

  /* ---------- the step lives in the URL hash ---------- */
  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash;
      // No hash is the very first page (Basics), which Back returns to. Other hashes that are
      // not steps (a skip link, a question anchor) leave the step alone.
      if (hash === '' || hash === '#') setStep('basics');
      else {
        const s = stepFromHash(hash);
        if (s) setStep(s);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const focusQuestionEl = (n: number) => {
    const el = document.getElementById(`q${n}`);
    el?.scrollIntoView({ block: 'center' });
    el?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled)')?.focus({
      preventScroll: true,
    });
  };

  useEffect(() => {
    setVisited((v) => (v.has(step) ? v : new Set(v).add(step)));
    setCurrent(questionNumbers(step)[0] ?? 0);
    if (firstStepRender.current) {
      firstStepRender.current = false;
      return;
    }
    const n = pendingQuestion.current;
    pendingQuestion.current = null;
    if (n) requestAnimationFrame(() => focusQuestionEl(n));
    else {
      window.scrollTo({ top: 0 });
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [step]);

  /* ---------- the chosen version's profile: what that version can and cannot do ---------- */
  useEffect(() => {
    const entry = versions?.versions.find((v) => v.id === answers.versionId);
    if (!entry) {
      setProfileStatus('idle');
      return;
    }
    let stale = false;
    setProfileStatus('loading');
    loadProfile(entry, { baseUrl: BASE }).then(
      (p) => {
        if (stale) return;
        setProfile(p);
        setProfileStatus('ready');
      },
      () => {
        if (!stale) setProfileStatus('failed');
      },
    );
    return () => {
      stale = true;
    };
  }, [versions, answers.versionId, profileTry]);

  /* ---------- derived state ---------- */
  // Only trust a profile that belongs to the version currently picked.
  const activeProfile = profile && profile.id === answers.versionId ? profile : null;
  const unavailable = useMemo(() => unavailableQuestions(activeProfile), [activeProfile]);
  const hardcore = answers.hardcore === 'yes';
  const effective: Answers = useMemo(
    () => (hardcore ? { ...answers, difficulty: 'hard' } : answers),
    [answers, hardcore],
  );
  const config = useMemo(() => toConfig(effective, eula), [effective, eula]);

  // The file the answers alone generate: the editor shows it, with the player's edits on top.
  const editorBase = useMemo(
    () =>
      activeProfile
        ? planProperties(activeProfile, { ...config, extraProperties: {} }).entries
        : [],
    [activeProfile, config],
  );
  const extraIssues = useMemo(
    () =>
      activeProfile
        ? checkExtraProperties(activeProfile, config.extraProperties, lockedKeys(config))
        : [],
    [activeProfile, config],
  );

  // Core says what is wrong as a code plus numbers; the words come from the page's language.
  const errors = useMemo(() => {
    const out: Partial<Record<string, string>> = {};
    if (!versions) return out;
    const r = validate(config, versions.versions);
    if (!r.ok) {
      for (const key of Object.keys(r.errors) as (keyof typeof r.errors)[]) {
        out[key] = errorText(r.details[key], r.errors[key] ?? '', m);
      }
    }
    // A map saved by a newer Minecraft than the server cannot be opened by it.
    if (mapInfo && mapVerdict(mapInfo, activeProfile) === 'newer') {
      out.map = t(m.map.verdictNewer, {
        server: answers.versionId,
        mapVersion: mapInfo.versionName ?? m.map.aNewerOne,
      });
    }
    // Lines in the editor that this version cannot take stop the download too.
    const editorErrors = extraIssues.filter((i) => i.level === 'error').length;
    if (editorErrors > 0 && !out.extraProperties) {
      out.extraProperties = t(m.errors.extraFix, { n: editorErrors });
    }
    return out;
  }, [config, versions, m, t, extraIssues, mapInfo, activeProfile, answers.versionId]);

  const badNumbers = QUESTIONS.map((q, i) =>
    errors[q.id] && !unavailable[q.id] ? i + 1 : 0,
  ).filter(Boolean);
  const javaMajor =
    versions?.versions.find((v) => v.id === answers.versionId)?.javaMajor ??
    versions?.versions.find((v) => v.id === versions.latest.release)?.javaMajor;
  const listReady = status === 'ready' && versions !== null;

  const stepStates = useMemo(() => {
    const out = {} as Record<StepId, StepState>;
    for (const s of STEPS) {
      const bad = questionNumbers(s.id).some((n) => badNumbers.includes(n));
      out[s.id] = bad ? 'bad' : visited.has(s.id) && s.id !== 'review' ? 'done' : 'todo';
    }
    return out;
  }, [badNumbers, visited]);

  const versionPicker: VersionPicker = {
    status,
    options: (versions?.versions ?? [])
      .filter((v) => showSnapshots || v.type === 'release')
      .map((v) => ({
        id: v.id,
        label: v.id,
        newest: v.id === versions?.latest.release,
        snapshot: v.type === 'snapshot',
      })),
    showSnapshots,
    onToggleSnapshots: (on) => {
      setShowSnapshots(on);
      if (!on && versions?.versions.find((v) => v.id === answers.versionId)?.type === 'snapshot') {
        setAnswers((a) => ({ ...a, versionId: versions.latest.release }));
      }
    },
    onRetry: () => {
      demo.current = null;
      load();
    },
  };

  /* ---------- reading position: which question gets the highlighter while scrolling ---------- */
  const measure = useCallback(() => {
    const head = runheadRef.current;
    if (!head) return;
    const top = head.getBoundingClientRect().bottom;
    const vh = window.innerHeight;
    const vis = [...document.querySelectorAll<HTMLElement>('[data-q]')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.bottom > top + 8 && r.top < vh - 8;
    });
    if (!vis.length) return;
    const target = top + Math.min(160, (vh - top) / 3);
    const at =
      vis.find((el) => {
        const r = el.getBoundingClientRect();
        return r.top <= target && r.bottom > target;
      }) ?? vis[0]!;
    if (Date.now() - lastFocusAt.current > 900) setCurrent(Number(at.dataset.q));
  }, []);
  useEffect(() => {
    let ticking = false;
    const on = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        measure();
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, [measure]);
  useEffect(() => {
    measure();
  }, [measure, status, step, phase, showSnapshots]);

  /* ---------- share link (only needed on the review step) ---------- */
  useEffect(() => {
    if (step !== 'review' || !versions) return;
    let stale = false;
    setCopied('idle');
    encodeShare(answers, versions.latest.release).then(
      (token) => {
        if (!stale)
          setShareLink(
            `${window.location.origin}${window.location.pathname}${SHARE_PREFIX}${token}`,
          );
      },
      () => {
        if (!stale) setShareLink('');
      },
    );
    return () => {
      stale = true;
    };
  }, [step, answers, versions]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied('ok');
    } catch {
      setCopied('failed');
    }
  };

  /* ---------- actions ---------- */
  const setAnswer = (id: QuestionId, value: string) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    if (phase === 'failed') setPhase('edit');
  };
  const focusQuestion = (n: number) => {
    lastFocusAt.current = Date.now();
    setCurrent(n);
  };
  /** Go to the step a question lives on, then focus it. */
  const goToQuestion = (n: number) => {
    const target = QUESTIONS[n - 1]?.step;
    if (!target) return;
    if (target === step) {
      focusQuestionEl(n);
      return;
    }
    pendingQuestion.current = n;
    window.location.hash = target;
  };

  const firstBad = badNumbers[0];
  let reason: React.ReactNode = '';
  if (!listReady) reason = m.card.whyList;
  else if (profileStatus === 'loading' || (profileStatus === 'idle' && versions)) {
    reason = m.card.whyDetails;
  } else if (profileStatus === 'failed') {
    reason = (
      <>
        {m.card.whyDetailsFailed}{' '}
        <button type="button" className="link" onClick={() => setProfileTry((n) => n + 1)}>
          {m.card.whyRetry}
        </button>
      </>
    );
  } else if (firstBad) {
    reason = rich(
      m.card.whyFix,
      { n: firstBad },
      {
        fix: (c) => (
          <a
            href={`#q${firstBad}`}
            onClick={(e) => {
              e.preventDefault();
              goToQuestion(firstBad);
            }}
          >
            {c}
          </a>
        ),
      },
    );
  } else if (!eula) reason = m.card.whyEula;
  const blocked = Boolean(reason);

  const download = async () => {
    if (blocked || phase === 'building' || !versions) return;
    setPhase('building');
    try {
      const blob = await buildBundle(config, versions.versions, {
        baseUrl: BASE,
        locale,
        helpUrl: `${window.location.origin}${helpHref}`,
      });
      const made: MadeZip = {
        blob,
        name: `minecraft-server-${config.versionId}.zip`,
        javaMajor,
        opUsername: config.opUsername,
        mapFolder: config.map?.folderName ?? '',
      };
      saveBlob(made.blob, made.name);
      setZip(made);
      setPhase('done');
    } catch {
      setPhase('failed');
    }
  };
  useEffect(() => {
    if (phase === 'done' && step === 'review') doneHeading.current?.focus();
  }, [phase, step]);

  /* ---------- summary ---------- */
  const question = (id: QuestionId) => QUESTIONS.find((q) => q.id === id) as Question;
  const mode = [
    answerText(question('gamemode'), effective.gamemode, m),
    answerText(question('difficulty'), effective.difficulty, m),
    ...(hardcore ? [m.card.hardcoreSuffix] : []),
  ].join(m.card.listSep);
  const rows: [string, string][] = [
    [m.card.rowVersion, answers.versionId || '…'],
    [m.card.rowRules, mode],
    [m.card.rowMemory, `${effective.ramGb || '?'} GB`],
    [m.card.rowWindow, effective.gui === 'yes' ? m.card.shown : m.card.hidden],
    [m.card.rowPlayers, t(m.card.upTo, { n: effective.maxPlayers || '?' })],
  ];
  const adoptium = (n: number) => ({
    adoptium: (c: string) => (
      <a
        href={`https://adoptium.net/temurin/releases/?version=${n}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {c}
      </a>
    ),
  });
  const javaText = javaMajor ? rich(m.card.java, { n: javaMajor }, adoptium(javaMajor)) : null;
  const statusLine = !listReady
    ? status === 'failed'
      ? m.card.listMissing
      : m.card.loadingVersions
    : badNumbers.length === 0
      ? m.card.allFine
      : badNumbers.length === 1
        ? m.card.fixOne
        : t(m.card.fixMany, { n: badNumbers.length });
  const statusOk = listReady && badNumbers.length === 0;

  // The exact files the zip would hold, shown on the review step (built only when it is open).
  const reviewFiles = useMemo(() => {
    if (step !== 'review' || !statusOk || !activeProfile || !versions) return null;
    const entry = versions.versions.find((v) => v.id === config.versionId);
    if (!entry) return null;
    try {
      return buildBundleFiles(config, entry, activeProfile, {
        locale,
        helpUrl: `${window.location.origin}${helpHref}`,
      });
    } catch {
      return null;
    }
  }, [step, statusOk, activeProfile, versions, config, locale, helpHref]);

  const groups: ReviewGroup[] = (['basics', 'gameplay', 'players', 'advanced'] as const).map(
    (id) => ({
      step: id,
      title: m.steps[id].title,
      rows: questionNumbers(id).map((n) => {
        const q = QUESTIONS[n - 1] as Question;
        const value = unavailable[q.id]
          ? m.review.notAvailable
          : q.id === 'allowedPlayers' && answers.whitelist !== 'list'
            ? m.review.notUsed
            : q.id === 'seed' && answers.map !== ''
              ? m.review.notUsedMap
              : answerText(q, q.id === 'difficulty' ? effective.difficulty : answers[q.id], m);
        const optionKey = OPTIONS.find((o) => o.id === q.id)?.key;
        const edited =
          optionKey !== undefined &&
          !unavailable[q.id] &&
          Object.prototype.hasOwnProperty.call(config.extraProperties, optionKey);
        return {
          label: m.labels[q.id],
          value: edited ? `${config.extraProperties[optionKey]} ${m.review.edited}` : value,
        };
      }),
    }),
  );
  const problems: Problem[] = badNumbers.map((n) => {
    const q = QUESTIONS[n - 1] as Question;
    return { n, title: m.questions[q.id].title, message: errors[q.id] ?? '' };
  });

  const noteFor = (id: QuestionId): string | undefined => {
    const u = unavailable[id];
    if (u) return unavailableNote(u, m);
    if (id === 'hardcore' && hardcore) return m.notes.hardcore;
    if (id === 'ramGb' && Number(answers.ramGb) >= 8) return m.notes.ramHigh;
    if (id === 'ramGb' && Number(answers.ramGb) === 1) return m.notes.ramLow;
    if (id === 'seed' && answers.map !== '') return m.notes.seedMap;
    const optionKey = OPTIONS.find((o) => o.id === id)?.key;
    if (optionKey && Object.prototype.hasOwnProperty.call(config.extraProperties, optionKey)) {
      return m.notes.setInEditor;
    }
    if (id === 'allowedPlayers') {
      if (answers.whitelist !== 'list') return m.notes.listOff;
      const n = parseList(answers.allowedPlayers).length;
      return [
        n === 0 ? '' : n === 1 ? m.notes.listOne : t(m.notes.listMany, { n }),
        answers.opUsername ? t(m.notes.ownerAdded, { name: answers.opUsername }) : '',
      ]
        .filter(Boolean)
        .join(' ');
    }
    if (id === 'blockedPlayers' || id === 'blockedIps') {
      const n = parseList(answers[id]).length;
      if (n === 0) return undefined;
      const one = id === 'blockedIps' ? m.notes.ipsOne : m.notes.listOne;
      const many = id === 'blockedIps' ? m.notes.ipsMany : m.notes.listMany;
      return n === 1 ? one : t(many, { n });
    }
    return undefined;
  };

  const renderQuestion = (n: number) => {
    const q = QUESTIONS[n - 1] as Question;
    return (
      <QuestionRow
        key={q.id}
        index={n}
        q={q}
        value={
          unavailable[q.id] ? '' : q.id === 'difficulty' ? effective.difficulty : answers[q.id]
        }
        error={
          errors[q.id] && q.kind !== 'version' && !unavailable[q.id] ? errors[q.id] : undefined
        }
        current={current === n}
        disabledValues={
          q.id === 'difficulty' && hardcore ? ['peaceful', 'easy', 'normal'] : undefined
        }
        unavailable={Boolean(unavailable[q.id])}
        off={
          (q.id === 'allowedPlayers' && answers.whitelist !== 'list') ||
          (q.id === 'seed' && answers.map !== '')
        }
        note={noteFor(q.id)}
        version={q.kind === 'version' ? versionPicker : undefined}
        editor={
          q.kind === 'editor'
            ? { profile: activeProfile, base: editorBase, locked: lockedKeys(config) }
            : undefined
        }
        map={
          q.kind === 'map'
            ? {
                info: mapInfo,
                profile: activeProfile,
                serverVersion: answers.versionId,
                onPick: (info) => {
                  setMapInfo(info);
                  setAnswers((a) => ({ ...a, map: info?.folderName ?? '' }));
                },
              }
            : undefined
        }
        onChange={setAnswer}
        onFocusQuestion={focusQuestion}
      />
    );
  };

  const here = questionNumbers(step);
  const next = nextStep(step);
  const prev = prevStep(step);
  const range = { from: here[0] ?? 0, to: here[here.length - 1] ?? 0, total: TOTAL };

  return (
    <>
      <a
        className="skip"
        href="#qs"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('qs')?.focus();
        }}
      >
        {m.site.skip}
      </a>
      <SiteHeader page="home" />
      <LangNotice page="home" />

      <p className="phone-note">{m.site.phoneNote}</p>

      <main className="layout">
        <div className="sheet">
          <StepBar steps={STEPS} current={step} states={stepStates} />
          {noticeKind && (
            <p className="notice" role="status">
              {noticeKind === 'shared' ? m.notice.shared : m.notice.badShare}{' '}
              <button type="button" className="link" onClick={() => setNoticeKind(null)}>
                {m.notice.dismiss}
              </button>
            </p>
          )}
          <div className="intro">
            <h2 tabIndex={-1} ref={headingRef}>
              {m.steps[step].title}
            </h2>
            <p>{m.steps[step].intro}</p>
          </div>

          {step !== 'review' ? (
            <>
              <div className="runhead" ref={runheadRef}>
                <span>{t(m.runhead.step, { n: stepIndex(step) + 1, total: STEPS.length })}</span>
                <span>
                  <span className="w">{t(m.runhead.questionsLong, range)}</span>
                  <span className="sh">{t(m.runhead.questionsShort, range)}</span>
                </span>
              </div>
              <form id="qs" tabIndex={-1} noValidate onSubmit={(e) => e.preventDefault()}>
                {here.map(renderQuestion)}
              </form>
              <div className="stepnav">
                {prev ? (
                  <a className="btn2" href={`#${prev.id}`}>
                    {t(m.nav.previous, { name: m.steps[prev.id].title })}
                  </a>
                ) : (
                  <span />
                )}
                <span className="stepnav-r">
                  {next && next.id !== 'review' && (
                    <a className="btn2" href="#review">
                      {m.nav.review}
                    </a>
                  )}
                  {next && (
                    <a className="btn2 solid" href={`#${next.id}`}>
                      {t(m.nav.next, { name: m.steps[next.id].title })}
                    </a>
                  )}
                </span>
              </div>
            </>
          ) : (
            <Review
              groups={groups}
              problems={problems}
              ready={listReady}
              java={javaText}
              shareLink={shareLink}
              copied={copied}
              onCopy={copyLink}
              onFix={goToQuestion}
              files={reviewFiles}
              remember={remember}
              onRemember={toggleRemember}
            />
          )}
        </div>

        <aside className="card" aria-label={m.card.title}>
          {step !== 'review' ? (
            <div>
              <h2>{m.card.title}</h2>
              <dl className="sum">
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              {javaText && <p className="java">{javaText}</p>}
              <p className={`status ${statusOk ? 'ok' : 'no'}`}>{statusLine}</p>
              <a className="btn2 wide" href="#review">
                {m.card.reviewButton}
              </a>
            </div>
          ) : phase !== 'done' ? (
            <div>
              <h2>{m.card.downloadTitle}</h2>
              <p className={`status ${statusOk ? 'ok' : 'no'}`}>{statusLine}</p>
              <div className="eula">
                <input
                  type="checkbox"
                  id="eula"
                  checked={eula}
                  onChange={(e) => setEula(e.target.checked)}
                  aria-describedby="why"
                />
                <label htmlFor="eula">
                  <span className="box" aria-hidden="true">
                    <svg viewBox="0 0 20 20">
                      <path d="M4 10.5l4 4 8-9" />
                    </svg>
                  </span>
                  <span>{m.card.eula}</span>
                </label>
                <a href={EULA_URL} target="_blank" rel="noopener noreferrer">
                  {m.card.readEula}
                </a>
              </div>
              <button
                type="button"
                ref={dlRef}
                className={`dl${phase === 'building' ? ' busy' : ''}`}
                aria-disabled={blocked}
                aria-busy={phase === 'building'}
                aria-describedby="why"
                onClick={download}
              >
                {phase === 'building' ? m.card.packing : m.card.downloadButton}
              </button>
              <p className="why" id="why" role={phase === 'failed' ? 'alert' : undefined}>
                {phase === 'failed' ? m.card.buildFailed : reason}
              </p>
            </div>
          ) : (
            <div>
              <h2 tabIndex={-1} ref={doneHeading}>
                {m.done.title}
              </h2>
              {zip && <p className="made">{rich(m.done.made, { name: zip.name })}</p>}
              <ol className="steps">
                <li>
                  <p>{rich(m.done.step1)}</p>
                </li>
                <li>
                  <p>{rich(m.done.step2)}</p>
                </li>
                <li>
                  <p>{rich(m.done.step3)}</p>
                </li>
              </ol>
              {zip?.mapFolder && (
                <p className="java">{rich(m.done.map, { folder: zip.mapFolder })}</p>
              )}
              {zip?.opUsername && (
                <p className="java">{rich(m.done.operator, { name: zip.opUsername })}</p>
              )}
              {zip?.javaMajor && (
                <p className="java">
                  {rich(m.done.java, { n: zip.javaMajor }, adoptium(zip.javaMajor))}
                </p>
              )}
              <p className="java">
                {rich(m.done.help, {}, { help: (c) => <a href={helpHref}>{c}</a> })}
              </p>
              <div className="actions">
                {zip && (
                  <button
                    type="button"
                    className="btn2"
                    onClick={() => saveBlob(zip.blob, zip.name)}
                  >
                    {m.done.again}
                  </button>
                )}
                <button
                  type="button"
                  className="btn2 again"
                  onClick={() => {
                    setPhase('edit');
                    window.location.hash = 'basics';
                  }}
                >
                  {m.done.change}
                </button>
              </div>
            </div>
          )}
        </aside>
      </main>

      <SiteFooter />
    </>
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
