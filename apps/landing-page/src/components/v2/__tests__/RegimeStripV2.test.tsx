import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { RegimeStripV2 } from '../RegimeStripV2';

describe('RegimeStripV2', () => {
  describe('rendering', () => {
    it('renders section element', () => {
      const { container } = render(<RegimeStripV2 />);
      expect(
        container.querySelector('.regime-strip-section'),
      ).toBeInTheDocument();
    });

    it('has aria-label for regime data', () => {
      const { container } = render(<RegimeStripV2 />);
      expect(container.querySelector('.regime-strip-section')).toHaveAttribute(
        'aria-label',
        'Regime data',
      );
    });

    it('renders live status', () => {
      render(<RegimeStripV2 />);
      expect(screen.getByText(/live · mainnet/)).toBeInTheDocument();
    });

    it('renders telemetry header', () => {
      render(<RegimeStripV2 />);
      expect(
        screen.getByText(/Telemetry feeding the next bundle/),
      ).toBeInTheDocument();
    });
  });

  describe('telemetry items', () => {
    it('renders all four regime items', () => {
      render(<RegimeStripV2 />);

      expect(screen.getByText('Regime')).toBeInTheDocument();
      expect(screen.getByText('FGI')).toBeInTheDocument();
      expect(screen.getByText('200MA Δ')).toBeInTheDocument();
      expect(screen.getByText('Next rebal')).toBeInTheDocument();
    });

    it('renders regime value', () => {
      render(<RegimeStripV2 />);
      expect(screen.getByText('Greed')).toBeInTheDocument();
    });

    it('renders FGI value', () => {
      render(<RegimeStripV2 />);
      expect(screen.getByText('72')).toBeInTheDocument();
    });

    it('renders 200MA delta value', () => {
      render(<RegimeStripV2 />);
      expect(screen.getByText('+14.2%')).toBeInTheDocument();
    });

    it('renders next rebalance time', () => {
      render(<RegimeStripV2 />);
      expect(screen.getByText('02:14:00')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has regime strip container', () => {
      const { container } = render(<RegimeStripV2 />);
      expect(container.querySelector('.regime-strip')).toBeInTheDocument();
    });

    it('has regime strip items', () => {
      const { container } = render(<RegimeStripV2 />);
      expect(container.querySelectorAll('.regime-strip-item').length).toBe(4);
    });
  });
});
