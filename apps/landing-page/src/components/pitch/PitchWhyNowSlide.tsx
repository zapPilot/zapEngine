import { PITCH_WHY_NOW } from '@/config/pitch';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 8 — Why Now. Three primitives that converged: tokenized equities,
 * EIP-7702, and intent-style routing.
 */
export function PitchWhyNowSlide() {
  return (
    <PitchSlide
      id="why-now"
      index={7}
      kicker={PITCH_WHY_NOW.kicker}
      title={PITCH_WHY_NOW.headline}
    >
      <div className="pitch-whynow-grid">
        {PITCH_WHY_NOW.items.map((item) => (
          <article className="pitch-whynow-card" key={item.label}>
            <p className="pitch-whynow-era">{item.era}</p>
            <h3 className="pitch-whynow-label">{item.label}</h3>
            <p className="pitch-whynow-body">{item.body}</p>
          </article>
        ))}
      </div>
    </PitchSlide>
  );
}
