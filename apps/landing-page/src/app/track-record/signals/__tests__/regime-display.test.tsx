import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDashboardResponse } from '@zapengine/types/api';

vi.mock('@/data/market-signals', () => ({
  gaugeSeries: vi.fn(),
  getMarketSignals: vi.fn(),
  seriesWithDma: vi.fn(),
  signalsAsOf: vi.fn(),
}));

import {
  gaugeSeries,
  getMarketSignals,
  seriesWithDma,
  signalsAsOf,
} from '@/data/market-signals';
import SignalsPage from '../page';

const mockedGaugeSeries = vi.mocked(gaugeSeries);
const mockedGetMarketSignals = vi.mocked(getMarketSignals);
const mockedSeriesWithDma = vi.mocked(seriesWithDma);
const mockedSignalsAsOf = vi.mocked(signalsAsOf);

describe('SignalsPage regime display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetMarketSignals.mockReturnValue({} as MarketDashboardResponse);
    mockedSignalsAsOf.mockReturnValue('2026-08-21');
    mockedSeriesWithDma.mockReturnValue([
      { date: '2026-08-21', value: 100, dma: 90 },
    ]);
    mockedGaugeSeries.mockImplementation((_signals, id) =>
      id === 'fgi'
        ? [
            { date: '2026-08-20', value: 40, regime: null },
            { date: '2026-08-21', value: 70, regime: 'mystery_regime' },
          ]
        : [
            { date: '2026-08-20', value: 50, regime: null },
            { date: '2026-08-21', value: 55, regime: 'extreme_greed' },
          ],
    );
  });

  it('passes unknown crypto regimes through and formats macro regimes', () => {
    render(<SignalsPage />);

    expect(screen.getByText('70 · mystery_regime')).toBeInTheDocument();
    expect(screen.getByText('55 · Extreme Greed')).toBeInTheDocument();
  });
});
