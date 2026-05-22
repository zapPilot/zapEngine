import Link from 'next/link';
import { PITCH_CTAS, PITCH_SLIDES } from '@/config/pitch';
import { BrandMark } from '../BrandMark';

export function NavbarPitch() {
  return (
    <nav className="pitch-nav-bar" aria-label="Pitch deck navigation">
      <Link
        className="pitch-nav-brand"
        href="/"
        aria-label="Back to Zap Pilot home"
      >
        <BrandMark />
      </Link>

      <p className="pitch-nav-counter" aria-label="Slide progress">
        <span data-pitch-counter-current>01</span>
        <span aria-hidden>/</span>
        <span>{String(PITCH_SLIDES.length).padStart(2, '0')}</span>
      </p>

      <div className="pitch-nav-actions">
        <Link className="pitch-nav-back" href="/">
          ← Home
        </Link>
        <a
          className="pitch-nav-cta"
          href={PITCH_CTAS.emailFounder}
          data-pitch-cta="navbar-email"
        >
          Email founder
        </a>
      </div>
    </nav>
  );
}
