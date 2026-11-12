'use client';

// The wizard's step bar (Azure-style tabs). Each step is a real link to its #hash, so the
// browser's Back button, middle-click and bookmarks all work without extra code.
import { useI18n } from '@/i18n/I18n';
import type { StepDef, StepId } from './steps';

export type StepState = 'todo' | 'done' | 'bad';

interface Props {
  steps: readonly StepDef[];
  current: StepId;
  states: Record<StepId, StepState>;
}

export function StepBar({ steps, current, states }: Props) {
  const { m } = useI18n();
  return (
    <nav className="stepbar" aria-label={m.stepbar.aria}>
      <ol>
        {steps.map((s, i) => {
          const state = states[s.id];
          const isCurrent = s.id === current;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={isCurrent ? 'step' : undefined}
                className={`${isCurrent ? 'cur ' : ''}${state}`}
              >
                <span className="sn" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="st">{m.steps[s.id].title}</span>
                {state === 'bad' && <span className="sr-only">{m.stepbar.bad}</span>}
                {state === 'done' && !isCurrent && (
                  <span className="sr-only">{m.stepbar.done}</span>
                )}
                <span className="mark" aria-hidden="true" />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
