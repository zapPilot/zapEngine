import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const POINT = { date: '2026-01-01', value: 100 };

async function loadWithSeries(
  series: Array<{
    id: string;
    label: string;
    color: string;
    values: Array<typeof POINT>;
  }>,
) {
  vi.resetModules();
  vi.doMock('@/data/equity-curve.json', () => ({
    default: {
      window: { start: '2026-01-01', end: '2026-01-02' },
      drawdownBand: { dcaPercent: -10 },
      series,
    },
  }));
  return import('../BacktestProof');
}

afterEach(() => {
  vi.doUnmock('@/data/equity-curve.json');
  vi.resetModules();
});

describe('BacktestProof artifact invariants', () => {
  it('rejects an empty equity series', async () => {
    const { BacktestProof } = await loadWithSeries([
      { id: 'strategy', label: 'Strategy', color: '#fff', values: [] },
      { id: 'dca', label: 'DCA', color: '#aaa', values: [POINT] },
    ]);
    expect(() => render(<BacktestProof />)).toThrow(
      'Equity series strategy must include at least one point',
    );
  });

  it('rejects a missing named equity series', async () => {
    const { BacktestProof } = await loadWithSeries([
      { id: 'strategy', label: 'Strategy', color: '#fff', values: [POINT] },
    ]);
    expect(() => render(<BacktestProof />)).toThrow(
      'Equity series dca is missing',
    );
  });
});
