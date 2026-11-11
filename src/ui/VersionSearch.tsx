'use client';

// The version question as a search box (ARIA combobox with a listbox popup).
// Type "1.21" or "snapshot" to narrow the list; arrows move, Enter picks, Escape closes.
// Leaving the box with text that is not a version puts the chosen version back, so the
// answer can never be invalid.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18n';
import { filterVersions, pickFromText, type VersionOption } from './versionFilter';

interface Props {
  /** The chosen version id. */
  value: string;
  options: readonly VersionOption[];
  labelledBy: string;
  describedBy: string;
  onPick: (id: string) => void;
}

export function VersionSearch({ value, options, labelledBy, describedBy, onPick }: Props) {
  const { m, t } = useI18n();
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (id: string) => `${uid}-o-${id}`;

  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  const [typed, setTyped] = useState(false); // false = show the whole list; true = filter by `text`
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Follow the chosen version when it changes from outside (e.g. test versions switched off),
  // unless the player is in the middle of typing.
  useEffect(() => {
    if (!typed) setText(value);
  }, [value, typed]);

  const results = useMemo(() => filterVersions(options, typed ? text : ''), [options, typed, text]);
  const current = results[active];

  const commit = (id: string) => {
    onPick(id);
    setText(id);
    setTyped(false);
    setOpen(false);
  };
  const revert = () => {
    setText(value);
    setTyped(false);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const n = results.length;
      if (n) setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === 'Enter') {
      e.preventDefault(); // the sheet is a form: Enter must not submit it
      if (open && current) commit(current.id);
      else {
        const hit = pickFromText(options, text);
        if (hit) commit(hit.id);
      }
    } else if (e.key === 'Escape') {
      if (open || typed) {
        e.preventDefault();
        revert();
      }
    }
  };

  const onBlur = () => {
    const hit = typed ? pickFromText(options, text) : null;
    if (hit) commit(hit.id);
    else revert();
  };

  // Keep the highlighted row in view while moving with the arrow keys.
  useEffect(() => {
    if (!open || !current) return;
    document.getElementById(optId(current.id))?.scrollIntoView({ block: 'nearest' });
  }, [active, open, current?.id]);

  return (
    <div className="vs">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && current ? optId(current.id) : undefined}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder={m.version.placeholder}
        value={text}
        onFocus={(e) => {
          setTyped(false);
          setActive(
            Math.max(
              0,
              options.findIndex((o) => o.id === value),
            ),
          );
          setOpen(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          setTyped(true);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onClick={() => setOpen(true)}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={m.version.listAria}
          onMouseDown={(e) => e.preventDefault()}
        >
          {results.length === 0 && (
            <li className="none" role="presentation">
              {t(m.version.none, { text: text.trim() })}
            </li>
          )}
          {results.map((o, i) => (
            <li
              key={o.id}
              id={optId(o.id)}
              role="option"
              aria-selected={o.id === value}
              className={i === active ? 'act' : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(o.id)}
            >
              <span>{o.id}</span>
              {o.newest && <span className="tag"> {m.version.newest}</span>}
              {o.snapshot && <span className="tag"> {m.version.test}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">
        {open
          ? t(results.length === 1 ? m.version.matchOne : m.version.matchMany, {
              n: results.length,
            })
          : ''}
      </p>
    </div>
  );
}
