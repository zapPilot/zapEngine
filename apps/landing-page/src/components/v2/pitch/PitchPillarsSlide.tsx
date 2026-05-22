import { PillarsV2 } from '../PillarsV2';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 5: Three pillars. Reuses PillarsV2 (SPY / BTC·ETH / USDC) so allocation
 * weights stay drift-proof against the home page.
 */
export function PitchPillarsSlide() {
  return (
    <PitchSlide id="pillars" index={4} variant="wrapped">
      <PillarsV2 />
    </PitchSlide>
  );
}
