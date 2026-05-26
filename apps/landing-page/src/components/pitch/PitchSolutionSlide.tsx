import { HowItWorksV2 } from '../HowItWorksV2';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 3: The product. Reuses HowItWorksV2 (Sense → Decide → Sign) so the
 * canonical strings in MESSAGES.howItWorksV2 are the single source of truth.
 */
export function PitchSolutionSlide() {
  return (
    <PitchSlide id="solution" index={2} variant="wrapped">
      <HowItWorksV2 />
    </PitchSlide>
  );
}
