import { describe, expect, it } from 'vitest';

import {
  buildPortfolioRouteSearchParams,
  readPortfolioRouteState,
} from '@/lib/portfolio/portfolioRouteState';

describe('portfolioRouteState', () => {
  describe('readPortfolioRouteState', () => {
    it('falls back to canonical defaults when params are missing', () => {
      expect(readPortfolioRouteState(new URLSearchParams())).toEqual({
        tab: 'dashboard',
        invest: 'trading',
      });
    });

    it('reads valid deep-link values', () => {
      expect(
        readPortfolioRouteState(
          new URLSearchParams('tab=invest&invest=market'),
        ),
      ).toEqual({
        tab: 'invest',
        invest: 'market',
      });
    });

    it('sanitizes invalid values back to defaults', () => {
      expect(
        readPortfolioRouteState(new URLSearchParams('tab=unknown&invest=nope')),
      ).toEqual({
        tab: 'dashboard',
        invest: 'trading',
      });
    });
  });

  describe('buildPortfolioRouteSearchParams', () => {
    it('preserves unrelated bundle params while updating the top-level tab', () => {
      const nextSearchParams = buildPortfolioRouteSearchParams(
        new URLSearchParams('userId=user-1&walletId=wallet-1'),
        { tab: 'analytics' },
      );

      expect(nextSearchParams.toString()).toBe(
        'userId=user-1&walletId=wallet-1&tab=analytics',
      );
    });

    it('adds canonical invest defaults when entering the invest tab', () => {
      const nextSearchParams = buildPortfolioRouteSearchParams(
        new URLSearchParams('userId=user-1'),
        { tab: 'invest' },
      );

      expect(nextSearchParams.toString()).toBe(
        'userId=user-1&tab=invest&invest=trading',
      );
    });

    it('writes the invest sub-tab when selecting the market sub-tab', () => {
      const nextSearchParams = buildPortfolioRouteSearchParams(
        new URLSearchParams('userId=user-1&tab=invest'),
        { tab: 'invest', invest: 'market' },
      );

      expect(nextSearchParams.toString()).toBe(
        'userId=user-1&tab=invest&invest=market',
      );
    });

    it('strips legacy market section param when leaving the invest tab', () => {
      const nextSearchParams = buildPortfolioRouteSearchParams(
        new URLSearchParams(
          'userId=user-1&tab=invest&invest=market&market=relative-strength',
        ),
        { tab: 'dashboard' },
      );

      expect(nextSearchParams.toString()).toBe('userId=user-1&tab=dashboard');
    });

    it('strips legacy market section param when staying inside the invest tab', () => {
      const nextSearchParams = buildPortfolioRouteSearchParams(
        new URLSearchParams(
          'userId=user-1&tab=invest&invest=market&market=relative-strength',
        ),
        { tab: 'invest', invest: 'backtesting' },
      );

      expect(nextSearchParams.toString()).toBe(
        'userId=user-1&tab=invest&invest=backtesting',
      );
    });
  });
});
