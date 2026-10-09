import { StatusNote } from '@/components/StatusBadge';
import { HERO as hero } from '@zapengine/zap-pilot-story/copy';
import {
  BRAND_NAME,
  SLOGAN,
  SLOGAN_PARTS,
  isLive,
} from '@zapengine/zap-pilot-story/brand';
import { PitchSlide } from './PitchSlide';

const wordStyles = {
  o: { color: 'transparent', WebkitTextStroke: '1.5px var(--ink)' },
  s: { color: 'var(--sign-ink)' },
  '': {},
};

/** Cover reuses the story hero and its capability chips. */
export function PitchTitleSlide() {
  return (
    <PitchSlide id="cover">
      <div className="pitch-cover-inner">
        <span className="pitch-cover-pill">{hero.eyebrow}</span>
        <h1
          className="pitch-cover-headline"
          id="pitch-cover-title"
          aria-label={SLOGAN}
        >
          {SLOGAN_PARTS.map((part, index) => {
            const style = !isLive(part.capability)
              ? 'o'
              : 'sign' in part
                ? 's'
                : '';
            return (
              <span key={part.capability}>
                Your{' '}
                <span data-style={style} style={wordStyles[style]}>
                  {part.word}
                </span>
                {index < SLOGAN_PARTS.length - 1 ? ' ' : ''}
              </span>
            );
          })}
        </h1>
        <p className="pitch-cover-subtitle">{hero.body}</p>
        <ul className="pitch-cover-chips">
          {hero.chips.map((chip) => (
            <li key={chip.text}>
              <StatusNote note={chip} />
            </li>
          ))}
        </ul>
        <p className="pitch-cover-meta" aria-hidden>
          <span>{BRAND_NAME}</span>
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
