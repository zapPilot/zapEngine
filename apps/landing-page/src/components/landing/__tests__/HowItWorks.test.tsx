import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { HowItWorks } from '../HowItWorks';

describe('HowItWorks', () => {
  describe('rendering', () => {
    it('renders section element', () => {
      const { container } = render(<HowItWorks />);
      expect(container.querySelector('.how-it-works')).toBeInTheDocument();
    });

    it('renders section kicker', () => {
      render(<HowItWorks />);
      expect(screen.getByText('How it works')).toBeInTheDocument();
    });

    it('renders main heading', () => {
      render(<HowItWorks />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        /Your account, looked after/,
      );
    });

    it('renders subtitle', () => {
      render(<HowItWorks />);
      expect(
        screen.getByText(/Three steps between market data/),
      ).toBeInTheDocument();
    });
  });

  describe('steps', () => {
    it('renders all three steps', () => {
      render(<HowItWorks />);

      expect(
        screen.getByRole('heading', { name: 'Sense' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Decide' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Sign' })).toBeInTheDocument();
    });

    it('renders step metadata', () => {
      render(<HowItWorks />);

      expect(screen.getByText(/200MA · FGI · ETH\/BTC/)).toBeInTheDocument();
      expect(screen.getByText(/Buy fear · defend greed/)).toBeInTheDocument();
      expect(screen.getByText(/In-app · EIP-7702/)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has section with id', () => {
      const { container } = render(<HowItWorks />);
      expect(container.querySelector('#how-it-works')).toBeInTheDocument();
    });

    it('uses article elements for steps', () => {
      const { container } = render(<HowItWorks />);
      expect(container.querySelectorAll('article.how-step').length).toBe(3);
    });

    it('has correct heading hierarchy', () => {
      render(<HowItWorks />);
      expect(
        screen.getAllByRole('heading', { level: 2 }).length,
      ).toBeGreaterThan(0);
      expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(3);
    });
  });
});
