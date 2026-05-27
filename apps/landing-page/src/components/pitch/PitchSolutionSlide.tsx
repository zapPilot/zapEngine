import { HowItWorks } from '@/components/landing/HowItWorks';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 3: The product. Reuses HowItWorks (Sense → Decide → Sign) so the
 * canonical strings in MESSAGES.howItWorks are the single source of truth.
 */
export function PitchSolutionSlide() {
  return (
    <PitchSlide id="solution" index={2} variant="wrapped">
      <HowItWorks />
    </PitchSlide>
  );
}
