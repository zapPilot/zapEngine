import { describe, expect, it } from 'vitest';

import { deriveTvlFromPortfolio } from '../../../../src/modules/hyperliquid/fetcher.helpers.js';

describe('Hyperliquid fetcher helper coverage', () => {
  it('returns null when the latest account value is undefined', () => {
    const portfolio = [
      ['day', { accountValueHistory: [[1000, undefined]] }],
    ] as unknown as Parameters<typeof deriveTvlFromPortfolio>[0];

    expect(deriveTvlFromPortfolio(portfolio)).toBeNull();
  });
});
