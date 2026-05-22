import type { ReactNode } from 'react';
import type { PitchSlideId } from '@/config/pitch';

type PitchSlideProps = {
  id: PitchSlideId;
  index: number;
  kicker?: string;
  title?: string;
  subtitle?: string;
  variant?: 'default' | 'wrapped';
  className?: string;
  children: ReactNode;
};

function classNames(...values: (string | false | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

/**
 * Snap-aligned slide primitive for the /pitch deck.
 *
 * `variant="wrapped"` removes inner horizontal padding so a child V2 component
 * (HowItWorksV2 / PillarsV2 / BacktestProofV2) can supply its own
 * `.v2-section` chrome. Otherwise the slide draws its own kicker/title/subtitle.
 */
export function PitchSlide({
  id,
  index,
  kicker,
  title,
  subtitle,
  variant = 'default',
  className,
  children,
}: PitchSlideProps) {
  const titleId = title ? `pitch-${id}-title` : undefined;

  return (
    <section
      id={`slide-${id}`}
      className={classNames(
        'pitch-slide',
        variant === 'wrapped' && 'pitch-slide--wrapped',
        className,
      )}
      data-slide-id={id}
      data-slide-index={index}
      {...(titleId ? { 'aria-labelledby': titleId } : {})}
    >
      <div className="pitch-slide-inner">
        {kicker && <p className="pitch-slide-kicker">{kicker}</p>}
        {title && (
          <h2 id={titleId} className="pitch-slide-title">
            {title}
          </h2>
        )}
        {subtitle && <p className="pitch-slide-subtitle">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
