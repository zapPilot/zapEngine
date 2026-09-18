import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/data/market-signals', () => ({
  gaugeSeries: vi.fn(() => []),
  getMarketSignals: vi.fn(() => null),
  seriesWithDma: vi.fn(() => []),
  signalsAsOf: vi.fn(() => ''),
}));

import SignalsPage from '../page';

describe('SignalsPage unavailable artifact', () => {
  it('renders an honest empty state instead of empty charts', () => {
    const { container } = render(<SignalsPage />);

    expect(
      screen.getByRole('heading', { name: 'Market Signals' }),
    ).toBeVisible();
    expect(
      screen.getByText('Market signals are temporarily unavailable.'),
    ).toBeVisible();
    expect(container.querySelectorAll('figure')).toHaveLength(0);
  });
});
