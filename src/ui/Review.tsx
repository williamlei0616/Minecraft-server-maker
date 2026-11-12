'use client';

// The last step: every answer in plain words, anything still to fix, and the share link.
// The EULA box and the Download button live in the card beside it.
import { useI18n } from '@/i18n/I18n';
import type { StepId } from './steps';

export interface ReviewRow {
  label: string;
  value: string;
}
export interface ReviewGroup {
  step: StepId;
  title: string;
  rows: ReviewRow[];
}
export interface ReviewFile {
  path: string;
  content: string;
}
export interface Problem {
  n: number;
  title: string;
  message: string;
}

interface Props {
  groups: ReviewGroup[];
  problems: Problem[];
  /** Whether the version list has loaded; before that nothing can be judged. */
  ready: boolean;
  java: React.ReactNode;
  shareLink: string;
  copied: 'idle' | 'ok' | 'failed';
  onCopy: () => void;
  onFix: (n: number) => void;
  /** The exact files the zip would hold, or null while they cannot be built. */
  files: ReviewFile[] | null;
  remember: boolean;
  onRemember: (on: boolean) => void;
}

export function Review({
  groups,
  problems,
  ready,
  java,
  shareLink,
  copied,
  onCopy,
  onFix,
  files,
  remember,
  onRemember,
}: Props) {
  const { m, t } = useI18n();
  return (
    <div className="review" id="qs" tabIndex={-1}>
      {ready && problems.length > 0 && (
        <div className="problems" role="alert">
          <h3>
            {problems.length === 1
              ? m.review.problemsOne
              : t(m.review.problemsMany, { n: problems.length })}
          </h3>
          <ul>
            {problems.map((p) => (
              <li key={p.n}>
                <a
                  href={`#q${p.n}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onFix(p.n);
                  }}
                >
                  {t(m.review.problemLink, { n: p.n, title: p.title })}
                </a>
                <span>{p.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.map((g) => (
        <section className="rev" key={g.step} aria-labelledby={`rev-${g.step}`}>
          <div className="rev-h">
            <h3 id={`rev-${g.step}`}>{g.title}</h3>
            <a href={`#${g.step}`} className="link">
              {m.review.change}
              <span className="sr-only"> {g.title}</span>
            </a>
          </div>
          <dl className="sum">
            {g.rows.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {java && <p className="java rev-java">{java}</p>}

      <section className="files" aria-labelledby="files-h">
        <details>
          <summary id="files-h">{m.review.filesTitle}</summary>
          <p>{m.review.filesIntro}</p>
          {files === null ? (
            <p className="msg note">{m.review.filesWaiting}</p>
          ) : (
            files.map((f) => (
              <details className="file" key={f.path}>
                <summary>
                  <code>{f.path}</code>
                  <span className="count">
                    {t(m.review.filesLines, { n: f.content.split('\n').length - 1 })}
                  </span>
                </summary>
                <pre tabIndex={0} aria-label={f.path}>
                  {f.content}
                </pre>
              </details>
            ))
          )}
        </details>
      </section>

      <section className="remember">
        <label className="snap">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => onRemember(e.target.checked)}
          />
          <span className="box" aria-hidden="true">
            <svg viewBox="0 0 20 20">
              <path d="M4 10.5l4 4 8-9" />
            </svg>
          </span>
          <span>{m.review.rememberLabel}</span>
        </label>
        <p className="msg note">{m.review.rememberHelp}</p>
      </section>

      <section className="share" aria-labelledby="share-h">
        <h3 id="share-h">{m.review.shareTitle}</h3>
        <p>{m.review.shareText}</p>
        <div className="sharerow">
          <input
            type="text"
            readOnly
            aria-label={m.review.shareAria}
            value={shareLink}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className="btn2" onClick={onCopy} disabled={!shareLink}>
            {m.review.copy}
          </button>
        </div>
        <p className="msg note" aria-live="polite">
          {copied === 'ok' && m.review.copied}
          {copied === 'failed' && m.review.copyFailed}
        </p>
      </section>
    </div>
  );
}
