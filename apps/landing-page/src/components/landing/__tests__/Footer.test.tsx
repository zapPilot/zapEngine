import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Footer } from '../Footer';

describe('Footer', () => {
  describe('rendering', () => {
    it('renders footer element', () => {
      const { container } = render(<Footer />);
      expect(container.querySelector('footer')).toBeInTheDocument();
    });

    it('renders brand name', () => {
      render(<Footer />);
      expect(screen.getByText(/Zap Pilot/)).toBeInTheDocument();
    });

    it('renders liquid-metal tag', () => {
      render(<Footer />);
      expect(screen.getByText('liquid-metal')).toBeInTheDocument();
    });

    it('renders live status indicator', () => {
      render(<Footer />);
      expect(screen.getByText(/mainnet status/)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has footer landmark', () => {
      const { container } = render(<Footer />);
      expect(container.querySelector('footer')).toBeInTheDocument();
    });

    it('has footer class', () => {
      const { container } = render(<Footer />);
      expect(container.querySelector('footer')).toHaveClass('footer');
    });
  });
});
