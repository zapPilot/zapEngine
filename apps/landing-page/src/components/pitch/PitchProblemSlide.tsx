import { MESSAGES } from '@/config/messages';
import { PITCH_PROBLEM } from '@/config/pitch';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 2 — The problem. Closes on the same line as the home page's closing
 * section, so the deck and the site make one argument.
 */
export function PitchProblemSlide() {
  return (
    <PitchSlide
      id="problem"
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
          {MESSAGES.closing.quote}
        </blockquote>
      </div>
    </PitchSlide>
  );
}
