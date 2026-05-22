import { MESSAGES } from '@/config/messages';
import { PITCH_PROBLEM } from '@/config/pitch';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 2 — The behavior we replace. Pulls the canonical "Buy in fear" quote
 * from MESSAGES so it always matches the home page philosophy strip.
 */
export function PitchProblemSlide() {
  return (
    <PitchSlide
      id="problem"
      index={1}
      kicker={PITCH_PROBLEM.kicker}
      title={PITCH_PROBLEM.headline}
    >
      <div className="pitch-problem-grid">
        <ul className="pitch-problem-bullets">
          {PITCH_PROBLEM.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
        <blockquote className="pitch-problem-quote">
          {MESSAGES.slogans.philosophy}
        </blockquote>
      </div>
    </PitchSlide>
  );
}
