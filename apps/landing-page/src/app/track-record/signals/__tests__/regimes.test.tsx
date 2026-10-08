import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  crypto: null as string | null,
  macro: null as string | null,
}));
vi.mock('@/data/market-signals', () => ({
  getMarketSignals: () => ({}),
  seriesWithDma: () => [{ date: '2026-08-20', value: 20, dma: null }],
  signalsAsOf: () => '2026-08-20',
  gaugeSeries: (_signals: unknown, id: string) => [
    {
      date: '2026-08-20',
      value: 50,
      regime: id === 'fgi' ? state.crypto : state.macro,
    },
  ],
}));
import SignalsPage from '../page';
beforeEach(() => {
  state.crypto = null;
  state.macro = null;
});
it('uses gauge defaults when providers omit both regimes', () => {
  render(<SignalsPage />);
  expect(screen.getAllByText('50 · Neutral')).toHaveLength(2);
  expect(
    screen.getByText('As of 2026-08-20 · 365-day window · regenerated nightly'),
  ).toBeVisible();
});
it('preserves unknown crypto regimes and humanizes macro regime codes', () => {
  state.crypto = 'Unmapped provider value';
  state.macro = 'extreme_fear';
  render(<SignalsPage />);
  expect(screen.getByText('50 · Unmapped provider value')).toBeVisible();
  expect(screen.getByText('50 · Extreme Fear')).toBeVisible();
});
