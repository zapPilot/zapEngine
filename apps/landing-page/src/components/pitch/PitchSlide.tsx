import type { ReactNode } from 'react';
import { PITCH_SLIDES, type PitchSlideId } from '@/config/pitch';
import { classNames } from '@/lib/classNames';

type PitchSlideProps = {
  id: PitchSlideId;
  kicker?: string;
  title?: string;
  subtitle?: string;
  variant?: 'default' | 'wrapped';
  className?: string;
  children: ReactNode;
};

/**
 * Snap-aligned slide primitive for the /pitch deck.
 *
 * `variant="wrapped"` removes inner horizontal padding so a child landing component
 * (HowItWorks / Pillars / BacktestProof) can supply its own
 * `.shell-section` chrome. Otherwise the slide draws its own kicker/title/subtitle.
 */
export function PitchSlide({
  id,
  kicker,
  title,
  subtitle,
  variant = 'default',
  className,
  children,
}: PitchSlideProps) {
  const titleId = title ? `pitch-${id}-title` : undefined;
  const index = PITCH_SLIDES.findIndex((slide) => slide.id === id);

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
