import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { HowItWorksV2 } from '../HowItWorksV2';

describe('HowItWorksV2', () => {
  describe('rendering', () => {
    it('renders section element', () => {
      const { container } = render(<HowItWorksV2 />);
      expect(container.querySelector('.how-it-works-v2')).toBeInTheDocument();
    });

    it('renders section kicker', () => {
      render(<HowItWorksV2 />);
      expect(screen.getByText('How it works')).toBeInTheDocument();
    });

    it('renders main heading', () => {
      render(<HowItWorksV2 />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        /Three steps/,
      );
    });

    it('renders subtitle', () => {
      render(<HowItWorksV2 />);
      expect(
        screen.getByText(/The engine turns regime data/),
      ).toBeInTheDocument();
    });
  });

  describe('steps', () => {
    it('renders all three steps', () => {
      render(<HowItWorksV2 />);

      expect(
        screen.getByRole('heading', { name: 'Sense' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Decide' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Sign' })).toBeInTheDocument();
    });

    it('renders step metadata', () => {
      render(<HowItWorksV2 />);

      expect(screen.getByText(/200MA · FGI · ETH\/BTC/)).toBeInTheDocument();
      expect(screen.getByText(/Buy fear · defend greed/)).toBeInTheDocument();
      expect(screen.getByText(/EIP-7702 · multicall3/)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has section with id', () => {
      const { container } = render(<HowItWorksV2 />);
      expect(container.querySelector('#how-it-works')).toBeInTheDocument();
    });

    it('uses article elements for steps', () => {
      const { container } = render(<HowItWorksV2 />);
      expect(container.querySelectorAll('article.how-step').length).toBe(3);
    });

    it('has correct heading hierarchy', () => {
      render(<HowItWorksV2 />);
      expect(
        screen.getAllByRole('heading', { level: 2 }).length,
      ).toBeGreaterThan(0);
      expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(3);
    });
  });
});
