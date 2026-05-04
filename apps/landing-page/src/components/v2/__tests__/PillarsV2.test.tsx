import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { PillarsV2 } from '../PillarsV2';

describe('PillarsV2', () => {
  describe('rendering', () => {
    it('renders section element', () => {
      const { container } = render(<PillarsV2 />);
      expect(container.querySelector('.pillars-deep')).toBeInTheDocument();
    });

    it('renders section kicker', () => {
      render(<PillarsV2 />);
      expect(screen.getByText('Three-pillar allocator')).toBeInTheDocument();
    });

    it('renders main heading with aria-labelledby', () => {
      render(<PillarsV2 />);
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent(/What the engine trades into/);
    });
  });

  describe('pillars', () => {
    it('renders all three pillar cards', () => {
      render(<PillarsV2 />);

      expect(
        screen.getByRole('heading', { name: 'S&P 500' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'BTC · ETH' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'USDC' })).toBeInTheDocument();
    });

    it('renders pillar tags', () => {
      render(<PillarsV2 />);

      expect(screen.getByText('TRADE INTO EQUITIES')).toBeInTheDocument();
      expect(screen.getByText('TRADE INTO CRYPTO BETA')).toBeInTheDocument();
      expect(screen.getByText('TRADE INTO DEFENSE')).toBeInTheDocument();
    });

    it('renders pillar statistics', () => {
      render(<PillarsV2 />);

      expect(screen.getByText('42%')).toBeInTheDocument();
      expect(screen.getByText('38%')).toBeInTheDocument();
      expect(screen.getByText('20%')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has section with aria-labelledby', () => {
      const { container } = render(<PillarsV2 />);
      const section = container.querySelector('.pillars-deep');
      expect(section).toHaveAttribute('aria-labelledby', 'pillars-title');
    });

    it('uses article elements for pillar cards', () => {
      const { container } = render(<PillarsV2 />);
      expect(container.querySelectorAll('article.pillar-card').length).toBe(3);
    });
  });
});
