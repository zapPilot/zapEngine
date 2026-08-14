import { Pillars } from './Pillars';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 5: Three pillars. Reuses Pillars (SPY / BTC·ETH / USDC) so allocation
 * weights stay drift-proof against the home page.
 */
export function PitchPillarsSlide() {
  return (
    <PitchSlide id="pillars" variant="wrapped">
      <Pillars />
    </PitchSlide>
  );
}
