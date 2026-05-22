import { BacktestProofV2 } from '../BacktestProofV2';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 6: Backtest proof. Reuses BacktestProofV2 which pulls every number
 * from MESSAGES.backtest + getBacktestSnapshot() — so the deck stays
 * automatically aligned with the analytics-engine snapshot gate.
 */
export function PitchProofSlide() {
  return (
    <PitchSlide id="proof" index={5} variant="wrapped">
      <BacktestProofV2 />
    </PitchSlide>
  );
}
