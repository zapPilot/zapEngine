import { describe, expect, it } from 'vitest';

import { portfolioDaysForRange } from '../src/integration/usePortfolioData';

describe('Portfolio data range mapping', () => {
  it('maps portfolio tabs to dashboard and yield windows', () => {
    expect(portfolioDaysForRange('1W')).toBe(7);
    expect(portfolioDaysForRange('1M')).toBe(30);
    expect(portfolioDaysForRange('3M')).toBe(90);
    expect(portfolioDaysForRange('1Y')).toBe(365);
    expect(portfolioDaysForRange('ALL')).toBe(365);
  });
});
