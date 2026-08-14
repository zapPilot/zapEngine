import { BacktestProof } from './BacktestProof';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 6: Backtest proof. Reuses BacktestProof which pulls every number
 * from MESSAGES.backtest + getBacktestSnapshot() — so the deck stays
 * automatically aligned with the analytics-engine snapshot gate.
 */
export function PitchProofSlide() {
  return (
    <PitchSlide id="proof" variant="wrapped">
      <BacktestProof />
    </PitchSlide>
  );
}
