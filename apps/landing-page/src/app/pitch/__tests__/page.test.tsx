import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { PITCH_SLIDES } from '@/config/pitch';
import PitchPage from '../page';

describe('PitchPage', () => {
  it('wraps content in shell-root and pitch-root for shared landing styling', () => {
    const { container } = render(<PitchPage />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('shell-root');
    expect(root).toHaveClass('pitch-root');
  });

  it('renders all 9 slides in canonical order', () => {
    const { container } = render(<PitchPage />);
    const slides = container.querySelectorAll('[data-slide-id]');
    const ids = Array.from(slides).map((el) =>
      el.getAttribute('data-slide-id'),
    );
    expect(ids).toEqual(PITCH_SLIDES.map((slide) => slide.id));
  });

  it('renders both fixed-chrome navs (top bar + right dot nav)', () => {
    const { container } = render(<PitchPage />);
    const navs = container.querySelectorAll('nav');
    expect(navs.length).toBeGreaterThanOrEqual(2);
  });

  it('reuses canonical hero copy from MESSAGES on the cover slide', () => {
    const { container } = render(<PitchPage />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/A Non-Custodial BlackRock in Your Wallet/);
    expect(text).toMatch(/Buy in fear\. Defend in greed\./);
  });

  it('reuses backtest, pillars and how-it-works content via wrapped slides', () => {
    const { container } = render(<PitchPage />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/Three steps/); // HowItWorks
    expect(text).toMatch(/What the engine trades into/); // Pillars
    expect(text).toMatch(/Trades drove the return/); // BacktestProof
    expect(text).toMatch(/100% Self-Custody/); // TrustStrip
  });
});
