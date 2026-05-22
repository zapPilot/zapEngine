import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { PITCH_ASK } from '@/config/pitch';
import { PitchAskSlide } from '../PitchAskSlide';

describe('PitchAskSlide', () => {
  it('renders the headline', () => {
    render(<PitchAskSlide />);
    expect(screen.getByText(PITCH_ASK.headline)).toBeInTheDocument();
  });

  it('renders one CTA per config entry', () => {
    render(<PitchAskSlide />);
    for (const cta of PITCH_ASK.ctas) {
      expect(screen.getByRole('link', { name: cta.label })).toBeInTheDocument();
    }
  });

  it('marks the first CTA as primary', () => {
    render(<PitchAskSlide />);
    const primary = screen.getByRole('link', {
      name: PITCH_ASK.ctas[0]!.label,
    });
    expect(primary).toHaveClass('pitch-ask-cta--primary');
  });

  it('opens external CTAs in a new tab with safe rel attrs', () => {
    render(<PitchAskSlide />);
    const externalCta = PITCH_ASK.ctas.find(
      (cta) => 'external' in cta && cta.external === true,
    );
    if (externalCta === undefined) {
      throw new Error('Expected one external CTA in PITCH_ASK');
    }
    const link = screen.getByRole('link', { name: externalCta.label });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps internal CTAs in the same tab', () => {
    render(<PitchAskSlide />);
    const internal = PITCH_ASK.ctas.find(
      (cta) => !('external' in cta) || cta.external !== true,
    );
    if (internal === undefined) {
      throw new Error('Expected at least one internal CTA in PITCH_ASK');
    }
    const link = screen.getByRole('link', { name: internal.label });
    expect(link).not.toHaveAttribute('target');
  });

  it('emits a data-pitch-cta tracking hook on every button', () => {
    const { container } = render(<PitchAskSlide />);
    const tagged = container.querySelectorAll('[data-pitch-cta]');
    expect(tagged.length).toBe(PITCH_ASK.ctas.length);
  });

  it('embeds the trust strip so the close echoes the home page', () => {
    const { container } = render(<PitchAskSlide />);
    expect(container.querySelector('.trust-strip')).toBeInTheDocument();
  });
});
