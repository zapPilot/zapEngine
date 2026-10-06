import { OwnershipCards } from '@/components/landing-v2/Ownership';
import { PITCH_SOLUTION } from '@/config/pitch';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 3 — Solution: the strategy / machine / wallet triad. Reuses the home
 * page's ownership cards so each layer's Today / Next status cannot drift.
 */
export function PitchSolutionSlide() {
  return (
    <PitchSlide
      id="solution"
      kicker={PITCH_SOLUTION.kicker}
      title={PITCH_SOLUTION.headline}
    >
      <OwnershipCards />
    </PitchSlide>
  );
}
