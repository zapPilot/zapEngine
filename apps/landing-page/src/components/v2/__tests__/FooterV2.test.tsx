import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { FooterV2 } from '../FooterV2';

describe('FooterV2', () => {
  describe('rendering', () => {
    it('renders footer element', () => {
      const { container } = render(<FooterV2 />);
      expect(container.querySelector('footer')).toBeInTheDocument();
    });

    it('renders brand name', () => {
      render(<FooterV2 />);
      expect(screen.getByText(/Zap Pilot/)).toBeInTheDocument();
    });

    it('renders v2 version indicator', () => {
      render(<FooterV2 />);
      expect(screen.getByText(/v2/)).toBeInTheDocument();
    });

    it('renders live status indicator', () => {
      render(<FooterV2 />);
      expect(screen.getByText(/mainnet status/)).toBeInTheDocument();
    });
  });

  describe('links', () => {
    it('renders back to v1 link', () => {
      render(<FooterV2 />);
      const backLink = screen.getByRole('link', { name: '← back to v1' });
      expect(backLink).toHaveAttribute('href', '/');
    });
  });

  describe('accessibility', () => {
    it('has footer landmark', () => {
      const { container } = render(<FooterV2 />);
      expect(container.querySelector('footer')).toBeInTheDocument();
    });

    it('has footer-v2 class', () => {
      const { container } = render(<FooterV2 />);
      expect(container.querySelector('footer')).toHaveClass('footer-v2');
    });
  });
});
