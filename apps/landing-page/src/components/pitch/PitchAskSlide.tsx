import { PITCH_ASK } from '@/config/pitch';
import { TrustStrip } from '@/components/landing/TrustStrip';
import { PitchSlide } from './PitchSlide';

/**
 * Slide 9 — The Ask. Closes with the call-to-action plus the canonical
 * TrustStrip so the deck ends on the same self-custody guarantees as the
 * home page footer.
 */
export function PitchAskSlide() {
  return (
    <PitchSlide id="ask" index={8}>
      <div className="pitch-ask-inner">
        <h2 className="pitch-ask-headline" id="pitch-ask-title">
          {PITCH_ASK.headline}
        </h2>
        <div className="pitch-ask-ctas" role="group" aria-label="Contact CTAs">
          {PITCH_ASK.ctas.map((cta) => {
            const external = 'external' in cta && cta.external === true;
            const isPrimary = 'primary' in cta && cta.primary === true;
            return (
              <a
                key={cta.label}
                href={cta.href}
                className={
                  isPrimary
                    ? 'pitch-ask-cta pitch-ask-cta--primary'
                    : 'pitch-ask-cta'
                }
                data-pitch-cta={`ask-${cta.label.toLowerCase().replace(/\s+/g, '-')}`}
                {...(external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                {cta.label}
              </a>
            );
          })}
        </div>
        <TrustStrip />
      </div>
    </PitchSlide>
  );
}
