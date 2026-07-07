import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { HeroAccountCard } from '../HeroAccountCard';

describe('HeroAccountCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the account preview with the canonical weights', () => {
    render(<HeroAccountCard />);

    expect(
      screen.getByLabelText('Zap Pilot account preview'),
    ).toBeInTheDocument();
    expect(screen.getByText('S&P 500')).toBeInTheDocument();
    expect(screen.getByText('BTC · ETH')).toBeInTheDocument();
    expect(screen.getByText('Stablecoins')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('38%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  it('counts the net worth up to the terminal value', () => {
    render(<HeroAccountCard />);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText('$128,540')).toBeInTheDocument();
  });

  it('cycles to the next rebalance state and pulses', () => {
    const { container } = render(<HeroAccountCard />);

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getByText('36%')).toBeInTheDocument();
    expect(screen.getByText('34%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(container.querySelector('.account-card.pulse')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(
      container.querySelector('.account-card.pulse'),
    ).not.toBeInTheDocument();
  });

  it('cleans up its timers on unmount', () => {
    const { unmount } = render(<HeroAccountCard />);

    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(20000);
      });
    }).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
