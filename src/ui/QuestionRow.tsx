'use client';

import { useI18n } from '@/i18n/I18n';
import type { PropertyEntry, VersionProfile } from '@/core';
import { MapPicker } from './MapPicker';
import { PropertiesEditor } from './PropertiesEditor';
import type { MapInfo } from './readMap';
import type { Question, QuestionId } from './questions';
import { VersionSearch } from './VersionSearch';
import type { VersionOption } from './versionFilter';

export interface VersionPicker {
  status: 'loading' | 'failed' | 'ready';
  options: VersionOption[]; // newest first
  showSnapshots: boolean;
  onToggleSnapshots: (on: boolean) => void;
  onRetry: () => void;
}

export interface EditorState {
  profile: VersionProfile | null;
  base: PropertyEntry[];
  /** Keys the editor may not change (the map owns level-name). */
  locked: string[];
}

export interface MapState {
  info: MapInfo | null;
  profile: VersionProfile | null;
  serverVersion: string;
  onPick: (info: MapInfo | null) => void;
}

interface Props {
  index: number;
  q: Question;
  value: string;
  error?: string;
  current: boolean;
  /** Choice values that cannot be picked right now (struck out). */
  disabledValues?: readonly string[];
  /** The whole question cannot be answered for this Minecraft version: everything is struck out. */
  unavailable?: boolean;
  /** The answer box is switched off by another answer (greyed out, still readable). */
  off?: boolean;
  /** Quiet extra sentence under the answers (not an error). */
  note?: string;
  version?: VersionPicker;
  editor?: EditorState;
  map?: MapState;
  onChange: (id: QuestionId, value: string) => void;
  onFocusQuestion: (index: number) => void;
}

const letter = (i: number) => String.fromCharCode(65 + i);

/** Roughly how wide an answer is: Chinese characters count double. */
const width = (label: React.ReactNode): number =>
  typeof label === 'string'
    ? [...label].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)
    : 0;

function Bubbles(props: {
  q: Question;
  name: QuestionId;
  options: readonly { value: string; label: React.ReactNode }[];
  value: string;
  disabledValues: readonly string[];
  onChange: Props['onChange'];
}) {
  const { q, name, options, value, disabledValues, onChange } = props;
  return (
    <div
      className={options.some((o) => width(o.label) > 12) ? 'opts long' : 'opts'}
      role="radiogroup"
      aria-labelledby={`h-${name}`}
      aria-describedby={`help-${name}`}
    >
      {options.map((o, i) => (
        <label className="o" key={o.value}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={disabledValues.includes(o.value)}
            onChange={() => onChange(q.id, o.value)}
          />
          <span className="b" aria-hidden="true">
            <span className="l">{letter(i)}</span>
          </span>
          <span className="t">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export function QuestionRow({
  index,
  q,
  value,
  error,
  current,
  disabledValues: disabledIn = [],
  unavailable = false,
  off = false,
  note,
  version,
  editor,
  map,
  onChange,
  onFocusQuestion,
}: Props) {
  const { m } = useI18n();
  const text = m.questions[q.id];
  let body: React.ReactNode = null;
  // An unavailable choice question strikes out every answer and shows none selected.
  const disabledValues = unavailable && q.kind === 'choice' ? q.opts : disabledIn;
  if (q.kind === 'version' && version) {
    if (version.status === 'failed') {
      body = (
        <div className="fail">
          <p>{m.version.failed}</p>
          <button type="button" className="btn2" onClick={version.onRetry}>
            {m.version.retry}
          </button>
        </div>
      );
    } else if (version.status === 'loading') {
      body = (
        <>
          <div className="skelbar" aria-busy="true" />
          <p className="msg note">{m.version.loading}</p>
        </>
      );
    } else {
      body = (
        <>
          <VersionSearch
            value={value}
            options={version.options}
            labelledBy={`h-${q.id}`}
            describedBy={`help-${q.id}`}
            onPick={(id) => onChange(q.id, id)}
          />
          <label className="snap">
            <input
              type="checkbox"
              checked={version.showSnapshots}
              onChange={(e) => version.onToggleSnapshots(e.target.checked)}
            />
            <span className="box" aria-hidden="true">
              <svg viewBox="0 0 20 20">
                <path d="M4 10.5l4 4 8-9" />
              </svg>
            </span>
            <span>{m.version.toggle}</span>
          </label>
        </>
      );
    }
  } else if (q.kind === 'choice') {
    body = (
      <Bubbles
        q={q}
        name={q.id}
        value={value}
        disabledValues={disabledValues}
        onChange={onChange}
        options={q.opts.map((v) => ({ value: v, label: text.options?.[v] ?? v }))}
      />
    );
  } else if (q.kind === 'map' && map) {
    body = (
      <MapPicker
        info={map.info}
        profile={map.profile}
        serverVersion={map.serverVersion}
        disabled={unavailable}
        onPick={map.onPick}
      />
    );
  } else if (q.kind === 'editor' && editor) {
    body = (
      <PropertiesEditor
        profile={editor.profile}
        base={editor.base}
        locked={editor.locked}
        value={value}
        disabled={unavailable}
        onChange={(text) => onChange(q.id, text)}
      />
    );
  } else if (q.kind === 'list') {
    body = (
      <div className="write">
        <textarea
          id={`f-${q.id}`}
          name={q.id}
          value={value}
          disabled={unavailable || off}
          rows={5}
          onChange={(e) => onChange(q.id, e.target.value)}
          aria-labelledby={`h-${q.id}`}
          aria-describedby={`help-${q.id} m-${q.id}`}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={text.placeholder}
        />
      </div>
    );
  } else if (q.kind === 'number' || q.kind === 'text') {
    body = (
      <div className="write">
        <input
          id={`f-${q.id}`}
          name={q.id}
          type={q.kind === 'number' ? 'number' : 'text'}
          value={value}
          disabled={unavailable || off}
          onChange={(e) => onChange(q.id, e.target.value)}
          aria-labelledby={`h-${q.id}`}
          aria-describedby={`help-${q.id} m-${q.id}`}
          aria-invalid={error ? true : undefined}
          {...(q.kind === 'number'
            ? { min: q.min, max: q.max, inputMode: 'numeric' as const }
            : {
                maxLength: q.max,
                autoComplete: 'off',
                spellCheck: false,
                placeholder: text.placeholder,
              })}
        />
        {q.kind === 'number' && text.unit && <span className="unit">{text.unit}</span>}
      </div>
    );
  }

  return (
    <section
      className={`q${current ? ' cur' : ''}${error ? ' bad' : ''}`}
      id={`q${index}`}
      data-q={index}
      onFocus={() => onFocusQuestion(index)}
    >
      <span className="n" aria-hidden="true">
        {index}
      </span>
      <div>
        <h3 id={`h-${q.id}`}>{text.title}</h3>
        <p className="help" id={`help-${q.id}`}>
          {text.help}
        </p>
        {body}
        {note && <p className="msg note">{note}</p>}
        <p className="msg err" id={`m-${q.id}`} role="alert">
          {error}
        </p>
      </div>
    </section>
  );
}
