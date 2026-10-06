import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TrustStrip } from '../TrustStrip';

describe('TrustStrip', () => {
  describe('rendering', () => {
    it('renders trust strip section', () => {
      const { container } = render(<TrustStrip />);
      expect(container.querySelector('.trust-strip')).toBeInTheDocument();
    });

    it('renders trust badges', () => {
      render(<TrustStrip />);

      expect(
        screen.getByText('Self-custody · no Zap Pilot vault'),
      ).toBeInTheDocument();
      expect(screen.getByText('Deposits on mainnet')).toBeInTheDocument();
      expect(screen.getByText('Open source')).toBeInTheDocument();
    });

    it('states mainnet deposits through a status badge, not prose', () => {
      const { container } = render(<TrustStrip />);
      const badge = container.querySelector('[data-capability]');
      expect(badge).toHaveAttribute('data-capability', 'deposit-plans');
      expect(badge).toHaveTextContent('Live');
    });
  });

  describe('links', () => {
    it('links open-source badge to GitHub', () => {
      render(<TrustStrip />);

      const githubLink = screen.getByRole('link', {
        name: /Open source/,
      });
      expect(githubLink).toHaveAttribute('href', 'https://github.com/zapPilot');
      expect(githubLink).toHaveAttribute('target', '_blank');
      expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('accessibility', () => {
    it('labels the trust signal region', () => {
      const { container } = render(<TrustStrip />);
      expect(container.querySelector('.trust-strip')).toHaveAttribute(
        'aria-label',
        'Trust signals',
      );
    });
  });
});
