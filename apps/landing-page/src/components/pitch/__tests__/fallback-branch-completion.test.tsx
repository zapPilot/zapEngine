import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MESSAGES } from '@/config/messages';
import { PITCH_ASK } from '@/config/pitch';
import { HowItWorks } from '../HowItWorks';
import { PitchAskSlide } from '../PitchAskSlide';

describe('pitch configuration fallbacks', () => {
  it('renders a newly configured external CTA safely', () => {
    const ctas = PITCH_ASK.ctas as unknown as Array<{
      label: string;
      href: string;
      external?: boolean;
      primary?: boolean;
    }>;
    ctas.push({
      label: 'External diligence room',
      href: 'https://example.test/diligence',
      external: true,
    });
    try {
      render(<PitchAskSlide />);
      expect(
        screen.getByRole('link', { name: 'External diligence room' }),
      ).toHaveAttribute('target', '_blank');
      expect(
        screen.getByRole('link', { name: 'External diligence room' }),
      ).toHaveAttribute('rel', 'noopener noreferrer');
    } finally {
      ctas.pop();
    }
  });

  it('falls back to the Radar icon when content adds a fourth step', () => {
    const steps = MESSAGES.howItWorks.steps as unknown as Array<{
      title: string;
      meta: string;
      description: string;
    }>;
    steps.push({
      title: 'Verify',
      meta: 'Receipts',
      description: 'Verify the resulting on-chain position.',
    });
    try {
      const { container } = render(<HowItWorks />);
      const heading = screen.getByRole('heading', { name: 'Verify' });
      expect(
        heading.closest('article')?.querySelector('svg'),
      ).toBeInTheDocument();
      expect(container.querySelectorAll('article.how-step')).toHaveLength(4);
    } finally {
      steps.pop();
    }
  });
});
