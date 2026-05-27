import { Pillars } from '@/components/landing/Pillars';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 5: Three pillars. Reuses Pillars (SPY / BTC·ETH / USDC) so allocation
 * weights stay drift-proof against the home page.
 */
export function PitchPillarsSlide() {
  return (
    <PitchSlide id="pillars" index={4} variant="wrapped">
      <Pillars />
    </PitchSlide>
  );
}
