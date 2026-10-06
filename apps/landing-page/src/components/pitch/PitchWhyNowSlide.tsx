import { StatusBadge } from '@/components/StatusBadge';
import { PITCH_WHY_NOW } from '@/config/pitch';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 9 — Why now: three shifts that made the wallet programmable. A shift
 * that leans on a Zap Pilot capability shows that capability's status.
 */
export function PitchWhyNowSlide() {
  return (
    <PitchSlide
      id="why-now"
      kicker={PITCH_WHY_NOW.kicker}
      title={PITCH_WHY_NOW.headline}
    >
      <div className="pitch-whynow-grid">
        {PITCH_WHY_NOW.items.map((item) => (
          <article className="pitch-whynow-card" key={item.label}>
            <p className="pitch-whynow-era">{item.era}</p>
            <h3 className="pitch-whynow-label">{item.label}</h3>
            <p className="pitch-whynow-body">{item.body}</p>
            {'capability' in item ? (
              <StatusBadge capability={item.capability} />
            ) : null}
          </article>
        ))}
      </div>
    </PitchSlide>
  );
}
