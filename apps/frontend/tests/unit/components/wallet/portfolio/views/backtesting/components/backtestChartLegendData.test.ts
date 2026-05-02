import { describe, expect, it } from 'vitest';

import {
  EVENT_LEGEND,
  INDICATOR_LEGEND,
} from '@/components/wallet/portfolio/views/backtesting/components/backtestChartLegendData';

describe('INDICATOR_LEGEND', () => {
  it('has exactly 4 items', () => {
    expect(INDICATOR_LEGEND).toHaveLength(4);
  });

  it('contains btcPrice, dma200, sentiment, and macroFearGreed in order', () => {
    expect(INDICATOR_LEGEND.map((item) => item.key)).toEqual([
      'btcPrice',
      'dma200',
      'sentiment',
      'macroFearGreed',
    ]);
  });

  it('has correct labels and colors', () => {
    expect(INDICATOR_LEGEND).toEqual([
      { key: 'btcPrice', label: 'BTC Price', color: '#3b82f6' },
      { key: 'dma200', label: 'DMA 200', color: '#f59e0b' },
      { key: 'sentiment', label: 'Sentiment', color: '#a855f7' },
      { key: 'macroFearGreed', label: 'Macro FGI', color: '#14b8a6' },
    ]);
  });
});

describe('EVENT_LEGEND', () => {
  it('has exactly 4 items', () => {
    expect(EVENT_LEGEND).toHaveLength(4);
  });

  it('contains the correct event labels in order', () => {
    expect(EVENT_LEGEND.map((item) => item.label)).toEqual([
      'Buy Spot',
      'Sell Spot',
      'Switch to ETH',
      'Switch to BTC',
    ]);
  });

  it('has correct colors for each event', () => {
    const colorMap = Object.fromEntries(
      EVENT_LEGEND.map((item) => [item.label, item.color]),
    );
    expect(colorMap['Buy Spot']).toBe('#22c55e');
    expect(colorMap['Sell Spot']).toBe('#ef4444');
    expect(colorMap['Switch to ETH']).toBe('#627EEA');
    expect(colorMap['Switch to BTC']).toBe('#F7931A');
  });

  it('every item has label and color properties', () => {
    for (const item of EVENT_LEGEND) {
      expect(typeof item.label).toBe('string');
      expect(typeof item.color).toBe('string');
    }
  });
});
