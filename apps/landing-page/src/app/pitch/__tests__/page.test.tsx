import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MESSAGES } from '@/config/messages';
import {
  PITCH_RUNTIME,
  PITCH_SLIDES,
  PITCH_SOLUTION,
  PITCH_WALLET,
} from '@/config/pitch';
import PitchPage from '../page';

describe('PitchPage', () => {
  it('wraps content in shell-root and pitch-root for shared landing styling', () => {
    const { container } = render(<PitchPage />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('shell-root');
    expect(root).toHaveClass('pitch-root');
  });

  it('renders every configured slide in canonical order', () => {
    const { container } = render(<PitchPage />);
    const ids = Array.from(container.querySelectorAll('[data-slide-id]')).map(
      (el) => el.getAttribute('data-slide-id'),
    );
    expect(ids).toEqual(PITCH_SLIDES.map((slide) => slide.id));
    for (const slide of PITCH_SLIDES) {
      expect(container.querySelector(`#slide-${slide.id}`)).not.toBeNull();
    }
  });

  it('renders both fixed-chrome navs (top bar + right dot nav)', () => {
    const { container } = render(<PitchPage />);
    const navs = container.querySelectorAll('nav');
    expect(navs.length).toBeGreaterThanOrEqual(2);
  });

  it('reuses the hero eyebrow, brand line and subtitle on the cover', () => {
    render(<PitchPage />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: MESSAGES.common.brandLine,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.hero.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.hero.subtitle)).toBeInTheDocument();
  });

  it('shows the ownership, runtime and wallet headlines', () => {
    render(<PitchPage />);
    for (const headline of [
      PITCH_SOLUTION.headline,
      PITCH_RUNTIME.headline,
      PITCH_WALLET.headline,
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: headline }),
      ).toBeInTheDocument();
    }
    for (const card of MESSAGES.ownership.cards) {
      expect(
        screen.getByRole('heading', { level: 3, name: card.title }),
      ).toBeInTheDocument();
    }
  });

  it('reuses backtest and trust-strip content via wrapped slides', () => {
    const { container } = render(<PitchPage />);
    const text = container.textContent ?? '';
    expect(text).toContain(MESSAGES.backtest.title);
    expect(text).toContain(MESSAGES.trustBadges[0].label);
    expect(text).not.toMatch(/Telegram delivers/);
    expect(text).not.toMatch(/autopilot/i);
  });
});
