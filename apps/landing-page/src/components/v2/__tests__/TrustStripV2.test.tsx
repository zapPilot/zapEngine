import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TrustStripV2 } from '../TrustStripV2';

describe('TrustStripV2', () => {
  describe('rendering', () => {
    it('renders trust strip section', () => {
      const { container } = render(<TrustStripV2 />);
      expect(container.querySelector('.trust-strip')).toBeInTheDocument();
    });

    it('renders trust badges', () => {
      render(<TrustStripV2 />);

      expect(screen.getByText('100% Self-Custody · EOA')).toBeInTheDocument();
      expect(screen.getByText('Live on Mainnet')).toBeInTheDocument();
      expect(screen.getByText('Open-source strategy')).toBeInTheDocument();
    });
  });

  describe('links', () => {
    it('links open-source badge to GitHub', () => {
      render(<TrustStripV2 />);

      const githubLink = screen.getByRole('link', {
        name: /Open-source strategy/,
      });
      expect(githubLink).toHaveAttribute('href', 'https://github.com/zapPilot');
      expect(githubLink).toHaveAttribute('target', '_blank');
      expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('accessibility', () => {
    it('labels the trust signal region', () => {
      const { container } = render(<TrustStripV2 />);
      expect(container.querySelector('.trust-strip')).toHaveAttribute(
        'aria-label',
        'Trust signals',
      );
    });
  });
});
