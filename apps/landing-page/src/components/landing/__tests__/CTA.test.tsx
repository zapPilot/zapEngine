import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { CTA } from '../CTA';

describe('CTA', () => {
  describe('rendering', () => {
    it('renders CTA section', () => {
      const { container } = render(<CTA />);
      expect(container.querySelector('section.cta')).toBeInTheDocument();
    });

    it('renders quote text', () => {
      render(<CTA />);
      expect(
        screen.getByText(/The goal isn't to trade more/),
      ).toBeInTheDocument();
    });

    it('renders subtitle', () => {
      render(<CTA />);
      expect(screen.getByText(/A rules engine/)).toBeInTheDocument();
    });
  });

  describe('CTA links', () => {
    it('renders primary CTA to telegram bot', () => {
      render(<CTA />);
      const primaryCta = screen.getByRole('link', {
        name: /Connect Telegram Bot/,
      });
      expect(primaryCta).toHaveAttribute('target', '_blank');
      expect(primaryCta).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders secondary CTA to docs', () => {
      render(<CTA />);
      const secondaryCta = screen.getByRole('link', {
        name: /Read the Strategy/,
      });
      expect(secondaryCta).toHaveAttribute('href', '/docs');
    });
  });

  describe('accessibility', () => {
    it('has proper section structure', () => {
      const { container } = render(<CTA />);
      expect(container.querySelector('.cta')).toBeInTheDocument();
    });

    it('has centered CTA row', () => {
      const { container } = render(<CTA />);
      expect(container.querySelector('.cta-row.center')).toBeInTheDocument();
    });
  });
});
