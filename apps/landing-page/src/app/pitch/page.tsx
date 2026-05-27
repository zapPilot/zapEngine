import { NavbarPitch } from '@/components/pitch/NavbarPitch';
import { PitchAskSlide } from '@/components/pitch/PitchAskSlide';
import { PitchExecutionSlide } from '@/components/pitch/PitchExecutionSlide';
import { PitchNav } from '@/components/pitch/PitchNav.client';
import { PitchPillarsSlide } from '@/components/pitch/PitchPillarsSlide';
import { PitchProblemSlide } from '@/components/pitch/PitchProblemSlide';
import { PitchProgressBar } from '@/components/pitch/PitchProgressBar.client';
import { PitchProofSlide } from '@/components/pitch/PitchProofSlide';
import { PitchSolutionSlide } from '@/components/pitch/PitchSolutionSlide';
import { PitchStrategySlide } from '@/components/pitch/PitchStrategySlide';
import { PitchTitleSlide } from '@/components/pitch/PitchTitleSlide';
import { PitchWhyNowSlide } from '@/components/pitch/PitchWhyNowSlide';

/**
 * /pitch — investor deck.
 *
 * The page is wrapped in `.shell-root .pitch-root` so all landing component CSS
 * (scoped to `.shell-root`) keeps working for the wrapped slides
 * (HowItWorks / Pillars / BacktestProof / TrustStrip), while
 * `.pitch-root` adds deck-only chrome and scroll-snap.
 */
export default function PitchPage() {
  return (
    <div className="shell-root pitch-root">
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
