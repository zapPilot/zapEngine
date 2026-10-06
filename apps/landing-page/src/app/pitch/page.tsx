import { NavbarPitch } from '@/components/pitch/NavbarPitch';
import { PitchAskSlide } from '@/components/pitch/PitchAskSlide';
import { PitchExecutionSlide } from '@/components/pitch/PitchExecutionSlide';
import { PitchNav } from '@/components/pitch/PitchNav.client';
import { PitchProblemSlide } from '@/components/pitch/PitchProblemSlide';
import { PitchProgressBar } from '@/components/pitch/PitchProgressBar.client';
import { PitchProofSlide } from '@/components/pitch/PitchProofSlide';
import { PitchRoadmapSlide } from '@/components/pitch/PitchRoadmapSlide';
import { PitchRuntimeSlide } from '@/components/pitch/PitchRuntimeSlide';
import { PitchSolutionSlide } from '@/components/pitch/PitchSolutionSlide';
import { PitchStrategySlide } from '@/components/pitch/PitchStrategySlide';
import { PitchTitleSlide } from '@/components/pitch/PitchTitleSlide';
import { PitchWhyNowSlide } from '@/components/pitch/PitchWhyNowSlide';

/**
 * /pitch — investor deck.
 *
 * The page is wrapped in `.shell-root .pitch-root` so all landing component CSS
 * (scoped to `.shell-root`) keeps working for the wrapped slides
 * (BacktestProof / TrustStrip), while `.pitch-root` adds deck-only chrome,
 * scroll-snap and the tokens the reused home-page cards (`.zp-*`) read.
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
        <PitchRuntimeSlide />
        <PitchStrategySlide />
        <PitchProofSlide />
        <PitchExecutionSlide />
        <PitchRoadmapSlide />
        <PitchWhyNowSlide />
        <PitchAskSlide />
      </main>
    </div>
  );
}
