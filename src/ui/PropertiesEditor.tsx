'use client';

// The advanced editor: the whole server.properties for the chosen version, editable.
// What is stored is only the lines the player changed (overrides), so changing an answer on
// another page still works. A deleted line goes back to the generated value. Lines that are
// not `key=value`, or repeat a key, are reported while typing and dropped when the box loses
// focus.
import { useMemo, useRef, useState } from 'react';
import {
  editorText,
  isSecretKey,
  overridesFromText,
  overridesToText,
  parseEditorText,
  type PropertyEntry,
  type PropertyIssue,
  type VersionProfile,
} from '@/core';
import { useI18n } from '@/i18n/I18n';
import { issueText } from './errors';

const IMPORT_MAX_BYTES = 100_000;

interface Props {
  /** The version's profile, or null while it loads (or if it could not). */
  profile: VersionProfile | null;
  /** The file the answers alone generate (no edits). */
  base: PropertyEntry[];
  /** Keys the player may not change here. */
  locked: string[];
  /** The saved edits, as `key=value` lines. */
  value: string;
  disabled?: boolean;
  onChange: (text: string) => void;
}

type Status =
  | { kind: 'none' }
  | { kind: 'imported'; n: number; left: string[] }
  | { kind: 'failed' }
  | { kind: 'tooBig' };

export function PropertiesEditor({ profile, base, locked, value, disabled, onChange }: Props) {
  const { m, t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'none' });
  const fileRef = useRef<HTMLInputElement>(null);

  const overrides = useMemo(() => overridesFromText(value), [value]);
  const shown = draft ?? editorText(base, overrides);
  const parsed = useMemo(
    () => (profile ? parseEditorText(shown, profile, base, locked) : null),
    [shown, profile, base, locked],
  );
  const count = Object.keys(overrides).length;
  const hasSecret = Object.keys(overrides).some(isSecretKey);

  const edit = (text: string) => {
    setDraft(text);
    if (!profile) return;
    const r = parseEditorText(text, profile, base, locked);
    onChange(overridesToText(r.overrides));
  };

  const importText = (text: string) => {
    if (!profile) return;
    const r = parseEditorText(text, profile, base, locked);
    const left = [
      ...new Set(
        r.issues.filter((i) => i.code === 'unknownKey' || i.code === 'volatile').map((i) => i.key),
      ),
    ];
    const kept: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.overrides)) if (!left.includes(k)) kept[k] = v;
    onChange(overridesToText(kept));
    setDraft(null);
    setStatus({ kind: 'imported', n: Object.keys(kept).length, left });
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      setStatus({ kind: 'tooBig' });
      return;
    }
    try {
      importText(await file.text());
    } catch {
      setStatus({ kind: 'failed' });
    }
  };

  if (!profile) {
    return <p className="msg note">{m.editor.waiting}</p>;
  }

  const issues: PropertyIssue[] = parsed?.issues ?? [];
  return (
    <div className="editor">
      <div className="editor-bar">
        <button
          type="button"
          className="btn2"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
        >
          {m.editor.import}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".properties,text/plain"
          hidden
          onChange={(e) => {
            void importFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn2"
          disabled={disabled || count === 0}
          onClick={() => {
            onChange('');
            setDraft(null);
            setStatus({ kind: 'none' });
          }}
        >
          {m.editor.reset}
        </button>
        <span className="editor-count" aria-live="polite">
          {count === 0
            ? m.editor.countNone
            : count === 1
              ? m.editor.countOne
              : t(m.editor.countMany, { n: count })}
        </span>
      </div>

      <div className="write">
        <textarea
          id="f-extraProperties"
          name="extraProperties"
          className="props"
          value={shown}
          disabled={disabled}
          rows={16}
          wrap="off"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-labelledby="h-extraProperties"
          aria-describedby="help-extraProperties m-extraProperties editor-notes"
          aria-invalid={issues.some((i) => i.level === 'error') ? true : undefined}
          onChange={(e) => edit(e.target.value)}
          onBlur={() => setDraft(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void importFile(e.dataTransfer.files[0]);
          }}
        />
      </div>

      <div id="editor-notes">
        <p className="msg note">{draft !== null ? m.editor.draftNote : m.editor.dropNote}</p>
        {hasSecret && <p className="msg note">{m.editor.secretsNote}</p>}
        <div aria-live="polite">
          {status.kind === 'imported' && (
            <p className="msg note">
              {t(m.editor.imported, { n: status.n })}
              {status.left.length > 0 &&
                ` ${t(m.editor.importedLeft, { n: status.left.length, keys: status.left.join(', ') })}`}
            </p>
          )}
          {status.kind === 'failed' && <p className="msg err">{m.editor.importFailed}</p>}
          {status.kind === 'tooBig' && <p className="msg err">{m.editor.importTooBig}</p>}
        </div>
        {issues.length > 0 && (
          <ul className="issues">
            {issues.map((i, n) => (
              <li key={`${i.code}-${i.key}-${i.line ?? n}`} className={i.level}>
                {i.line !== undefined && (
                  <span className="ln">{t(m.editor.line, { n: i.line })}</span>
                )}
                <span>{issueText(i, m)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
