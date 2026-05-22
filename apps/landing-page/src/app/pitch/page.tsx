import { NavbarPitch } from '@/components/v2/pitch/NavbarPitch';
import { PitchAskSlide } from '@/components/v2/pitch/PitchAskSlide';
import { PitchExecutionSlide } from '@/components/v2/pitch/PitchExecutionSlide';
import { PitchNav } from '@/components/v2/pitch/PitchNav.client';
import { PitchPillarsSlide } from '@/components/v2/pitch/PitchPillarsSlide';
import { PitchProblemSlide } from '@/components/v2/pitch/PitchProblemSlide';
import { PitchProgressBar } from '@/components/v2/pitch/PitchProgressBar.client';
import { PitchProofSlide } from '@/components/v2/pitch/PitchProofSlide';
import { PitchSolutionSlide } from '@/components/v2/pitch/PitchSolutionSlide';
import { PitchStrategySlide } from '@/components/v2/pitch/PitchStrategySlide';
import { PitchTitleSlide } from '@/components/v2/pitch/PitchTitleSlide';
import { PitchWhyNowSlide } from '@/components/v2/pitch/PitchWhyNowSlide';

/**
 * /pitch — investor deck.
 *
 * The page is wrapped in `.v2-root .pitch-root` so all V2 component CSS
 * (scoped to `.v2-root`) keeps working for the wrapped slides
 * (HowItWorksV2 / PillarsV2 / BacktestProofV2 / TrustStripV2), while
 * `.pitch-root` adds deck-only chrome and scroll-snap.
 */
export default function PitchPage() {
  return (
    <div className="v2-root pitch-root">
      <PitchProgressBar />
      <NavbarPitch />
      <PitchNav />
      <main>
        <PitchTitleSlide />
        <PitchProblemSlide />
        <PitchSolutionSlide />
        <PitchStrategySlide />
        <PitchPillarsSlide />
        <PitchProofSlide />
        <PitchExecutionSlide />
        <PitchWhyNowSlide />
        <PitchAskSlide />
      </main>
    </div>
  );
}
