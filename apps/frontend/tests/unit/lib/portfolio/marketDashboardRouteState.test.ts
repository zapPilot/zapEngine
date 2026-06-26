import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ACTIVE_LINES,
  type MarketLineKey,
} from '@/components/wallet/portfolio/views/invest/market/sections/marketDashboardConstants';
import {
  buildMarketDashboardSearchParams,
  readMarketDashboardRouteState,
} from '@/components/wallet/portfolio/views/invest/market/sections/marketDashboardRouteState';

function toSortedArray(values: ReadonlySet<MarketLineKey>): MarketLineKey[] {
  return [...values].sort();
}

describe('marketDashboardRouteState', () => {
  describe('readMarketDashboardRouteState', () => {
    it('falls back to canonical defaults when params are missing', () => {
      const state = readMarketDashboardRouteState(new URLSearchParams());

      expect(state.timeframe).toBe('MAX');
      expect(toSortedArray(state.activeLines)).toEqual(
        toSortedArray(DEFAULT_ACTIVE_LINES),
      );
    });

    it('reads valid timeframe and filters invalid line keys', () => {
      const state = readMarketDashboardRouteState(
        new URLSearchParams('tf=1Y&lines=btcPrice,bogus,fgi'),
      );

      expect(state.timeframe).toBe('1Y');
      expect(toSortedArray(state.activeLines)).toEqual(['btcPrice', 'fgi']);
    });

    it('treats present empty lines param as an empty active set', () => {
      const state = readMarketDashboardRouteState(
        new URLSearchParams('lines='),
      );

      expect(state.activeLines.size).toBe(0);
    });
  });

  describe('buildMarketDashboardSearchParams', () => {
    it('preserves unrelated params while writing non-default dashboard state', () => {
      const nextSearchParams = buildMarketDashboardSearchParams(
        new URLSearchParams('userId=user-1&tab=invest&invest=market'),
        {
          timeframe: '1Y',
          activeLines: new Set(['btcPrice', 'fgi']),
        },
      );

      expect(nextSearchParams.get('userId')).toBe('user-1');
      expect(nextSearchParams.get('tab')).toBe('invest');
      expect(nextSearchParams.get('invest')).toBe('market');
      expect(nextSearchParams.get('tf')).toBe('1Y');
      expect(nextSearchParams.get('lines')).toBe('btcPrice,fgi');
    });

    it('removes dashboard params when patched back to defaults', () => {
      const nextSearchParams = buildMarketDashboardSearchParams(
        new URLSearchParams('userId=user-1&tf=1Y&lines=btcPrice'),
        {
          timeframe: 'MAX',
          activeLines: DEFAULT_ACTIVE_LINES,
        },
      );

      expect(nextSearchParams.toString()).toBe('userId=user-1');
    });
  });
});
