import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PITCH_ASK } from '@/config/pitch';
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
});
