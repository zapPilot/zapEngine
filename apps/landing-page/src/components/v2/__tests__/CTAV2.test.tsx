import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { CTAV2 } from '../CTAV2';

describe('CTAV2', () => {
  describe('rendering', () => {
    it('renders CTA section', () => {
      const { container } = render(<CTAV2 />);
      expect(container.querySelector('section.cta-v2')).toBeInTheDocument();
    });

    it('renders quote text', () => {
      render(<CTAV2 />);
      expect(
        screen.getByText(/The goal isn't to trade more/),
      ).toBeInTheDocument();
    });

    it('renders subtitle', () => {
      render(<CTAV2 />);
      expect(screen.getByText(/A rules engine/)).toBeInTheDocument();
    });
  });

  describe('CTA links', () => {
    it('renders primary CTA to telegram bot', () => {
      render(<CTAV2 />);
      const primaryCta = screen.getByRole('link', {
        name: /Connect Telegram Bot/,
      });
      expect(primaryCta).toHaveAttribute('target', '_blank');
      expect(primaryCta).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders secondary CTA to docs', () => {
      render(<CTAV2 />);
      const secondaryCta = screen.getByRole('link', {
        name: /Read the Strategy/,
      });
      expect(secondaryCta).toHaveAttribute('href', '/docs');
    });
  });

  describe('accessibility', () => {
    it('has proper section structure', () => {
      const { container } = render(<CTAV2 />);
      expect(container.querySelector('.cta-v2')).toBeInTheDocument();
    });

    it('has centered CTA row', () => {
      const { container } = render(<CTAV2 />);
      expect(container.querySelector('.cta-row.center')).toBeInTheDocument();
    });
  });
});
