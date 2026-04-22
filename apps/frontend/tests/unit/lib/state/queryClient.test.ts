/**
 * Unit tests for queryClient and queryKeys factory
 */
import { describe, expect, it } from 'vitest';

import { queryClient, queryKeys } from '@/lib/state/queryClient';

describe('queryClient', () => {
  it('should be a QueryClient instance', () => {
    expect(queryClient).toBeDefined();
    expect(typeof queryClient.getQueryData).toBe('function');
    expect(typeof queryClient.setQueryData).toBe('function');
  });

  it('should have correct default options', () => {
    const defaultOptions = queryClient.getDefaultOptions();

    expect(defaultOptions.queries?.retry).toBe(2);
    expect(defaultOptions.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaultOptions.queries?.refetchOnMount).toBe(false);
    expect(defaultOptions.queries?.refetchOnReconnect).toBe(false);
    expect(defaultOptions.queries?.refetchInterval).toBe(false);
    expect(defaultOptions.queries?.refetchIntervalInBackground).toBe(false);
    expect(defaultOptions.mutations?.retry).toBe(1);
  });
});

describe('queryKeys', () => {
  describe('user', () => {
    it('should have all base key', () => {
      expect(queryKeys.user.all).toEqual(['user']);
    });

    it('should create byWallet key', () => {
      const key = queryKeys.user.byWallet('0x123abc');
      expect(key).toEqual(['user', 'by-wallet', '0x123abc']);
    });

    it('should create bundleWallets key', () => {
      const key = queryKeys.user.bundleWallets('user-123');
      expect(key).toEqual(['user', 'bundle-wallets', 'user-123']);
    });

    it('should create wallets key', () => {
      const key = queryKeys.user.wallets('user-123');
      expect(key).toEqual(['user-wallets', 'user-123']);
    });

    it('should create byId key', () => {
      const key = queryKeys.user.byId('user-123');
      expect(key).toEqual(['user', 'by-id', 'user-123']);
    });
  });

  describe('portfolio', () => {
    it('should have all base key', () => {
      expect(queryKeys.portfolio.all).toEqual(['portfolio']);
    });

    it('should create summary key', () => {
      const key = queryKeys.portfolio.summary('user-123');
      expect(key).toEqual(['portfolio', 'summary', 'user-123']);
    });

    it('should create analytics key', () => {
      const key = queryKeys.portfolio.analytics('user-123');
      expect(key).toEqual(['portfolio', 'analytics', 'user-123']);
    });

    it('should create apr key', () => {
      const key = queryKeys.portfolio.apr('user-123');
      expect(key).toEqual(['portfolio', 'apr', 'user-123']);
    });

    it('should create landingPage key', () => {
      const key = queryKeys.portfolio.landingPage('user-123');
      expect(key).toEqual(['portfolio', 'landing-page', 'user-123']);
    });

    it('should create yieldSummary key', () => {
      const key = queryKeys.portfolio.yieldSummary('user-123');
      expect(key).toEqual(['portfolio', 'yield-summary', 'user-123']);
    });

    it('should create borrowingPositions key', () => {
      const key = queryKeys.portfolio.borrowingPositions('user-123');
      expect(key).toEqual(['portfolio', 'borrowing-positions', 'user-123']);
    });
  });

  describe('strategies', () => {
    it('should have all base key', () => {
      expect(queryKeys.strategies.all).toEqual(['strategies']);
    });

    it('should create lists key', () => {
      const key = queryKeys.strategies.lists();
      expect(key).toEqual(['strategies', 'list']);
    });

    it('should create list key without config', () => {
      const key = queryKeys.strategies.list();
      expect(key).toEqual(['strategies', 'list', undefined]);
    });

    it('should create list key with config', () => {
      const config = { sort: 'asc' };
      const key = queryKeys.strategies.list(config);
      expect(key).toEqual(['strategies', 'list', config]);
    });

    it('should create withPortfolio key', () => {
      const key = queryKeys.strategies.withPortfolio('user-123', {
        filter: 'active',
      });
      expect(key).toEqual([
        'strategies',
        'list',
        'portfolio',
        'user-123',
        { filter: 'active' },
      ]);
    });

    it('should create withPortfolio key without args', () => {
      const key = queryKeys.strategies.withPortfolio();
      expect(key).toEqual([
        'strategies',
        'list',
        'portfolio',
        undefined,
        undefined,
      ]);
    });
  });

  describe('balances', () => {
    it('should have all base key', () => {
      expect(queryKeys.balances.all).toEqual(['tokenBalances']);
    });

    it('should create list key', () => {
      const key = queryKeys.balances.list(
        1,
        '0xwallet',
        ['0xtoken1', '0xtoken2'],
        false,
      );
      expect(key).toEqual([
        'tokenBalances',
        1,
        '0xwallet',
        ['0xtoken1', '0xtoken2'],
        false,
      ]);
    });

    it('should create list key with skipCache true', () => {
      const key = queryKeys.balances.list(137, '0xwallet', [], true);
      expect(key).toEqual(['tokenBalances', 137, '0xwallet', [], true]);
    });
  });

  describe('prices', () => {
    it('should have all base key', () => {
      expect(queryKeys.prices.all).toEqual(['tokenPrices']);
    });

    it('should create list key', () => {
      const key = queryKeys.prices.list('BTC,ETH,USDC');
      expect(key).toEqual(['tokenPrices', 'BTC,ETH,USDC']);
    });
  });

  describe('zapTokens', () => {
    it('should have all base key', () => {
      expect(queryKeys.zapTokens.all).toEqual(['zapTokens']);
    });

    it('should create byChain key', () => {
      const key = queryKeys.zapTokens.byChain(1);
      expect(key).toEqual(['zapTokens', 1]);
    });
  });

  describe('strategyAdmin', () => {
    it('should have all base key', () => {
      expect(queryKeys.strategyAdmin.all).toEqual(['strategyAdmin']);
    });

    it('should create configs key', () => {
      const key = queryKeys.strategyAdmin.configs();
      expect(key).toEqual(['strategyAdmin', 'configs']);
    });

    it('should create config key', () => {
      const key = queryKeys.strategyAdmin.config('config-456');
      expect(key).toEqual(['strategyAdmin', 'config', 'config-456']);
    });
  });

  describe('sentiment', () => {
    it('should have all base key', () => {
      expect(queryKeys.sentiment.all).toEqual(['sentiment']);
    });

    it('should create market key', () => {
      const key = queryKeys.sentiment.market();
      expect(key).toEqual(['sentiment', 'market']);
    });

    it('should create regimeHistory key', () => {
      const key = queryKeys.sentiment.regimeHistory();
      expect(key).toEqual(['sentiment', 'regime-history']);
    });
  });
});
