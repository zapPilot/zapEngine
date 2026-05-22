import { PITCH_EXECUTION } from '@/config/pitch';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 7 — Execution. Two columns: bullet list of properties on the left,
 * vertical CSS flow diagram on the right with the "you sign" step highlighted
 * in brand gold to anchor the self-custody story.
 */
export function PitchExecutionSlide() {
  return (
    <PitchSlide
      id="execution"
      index={6}
      kicker={PITCH_EXECUTION.kicker}
      title={PITCH_EXECUTION.headline}
    >
      <div className="pitch-execution-grid">
        <ul className="pitch-execution-bullets">
          {PITCH_EXECUTION.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>

        <ol
          className="pitch-execution-flow"
          aria-label="Execution flow: regime shift to on-chain settlement"
        >
          {PITCH_EXECUTION.flow.map((step, index) => {
            const isHighlight = index === PITCH_EXECUTION.signStepIndex;
            return (
              <li
                key={step}
                className={
                  isHighlight
                    ? 'pitch-execution-step pitch-execution-step--highlight'
                    : 'pitch-execution-step'
                }
              >
                {String(index + 1).padStart(2, '0')} · {step}
              </li>
            );
          })}
        </ol>
      </div>
    </PitchSlide>
  );
}
