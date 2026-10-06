import { StatusNote } from '@/components/StatusBadge';
import { MESSAGES } from '@/config/messages';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 1 — Cover. Pulls strings from MESSAGES so the deck headline can never
 * drift from the home page hero, including the status chips that keep the
 * brand line honest about what runs today.
 */
export function PitchTitleSlide() {
  const { hero, common } = MESSAGES;
  return (
    <PitchSlide id="cover">
      <div className="pitch-cover-inner">
        <span className="pitch-cover-pill">{hero.eyebrow}</span>
        <h1 className="pitch-cover-headline" id="pitch-cover-title">
          {common.brandLine}
        </h1>
        <p className="pitch-cover-subtitle">{hero.subtitle}</p>
        <ul className="pitch-cover-chips">
          {hero.chips.map((chip) => (
            <li key={chip.text}>
              <StatusNote note={chip} />
            </li>
          ))}
        </ul>
        <p className="pitch-cover-meta" aria-hidden>
          <span>{common.brandName}</span>
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
