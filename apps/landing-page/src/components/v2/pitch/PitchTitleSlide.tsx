import { MESSAGES } from '@/config/messages';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 1 — Cover. Pulls strings from MESSAGES so the deck headline can never
 * drift from the home page hero.
 */
export function PitchTitleSlide() {
  return (
    <PitchSlide id="cover" index={0}>
      <div className="pitch-cover-inner">
        <span className="pitch-cover-pill">{MESSAGES.slogans.philosophy}</span>
        <h1 className="pitch-cover-headline" id="pitch-cover-title">
          {MESSAGES.hero.title.primary}
        </h1>
        <p className="pitch-cover-subtitle">{MESSAGES.hero.subtitle}</p>
        <p className="pitch-cover-meta" aria-hidden>
          <span>{MESSAGES.common.brandName}</span>
          <span>·</span>
          <span>Investor Pitch</span>
        </p>
      </div>
      <p className="pitch-cover-hint" aria-hidden>
        Scroll or press ↓
      </p>
    </PitchSlide>
  );
}
