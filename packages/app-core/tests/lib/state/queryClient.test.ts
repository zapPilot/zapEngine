import { afterEach, describe, expect, it, vi } from 'vitest';

import { APIError } from '@core/lib/http/errors';
import { setErrorReporter } from '@core/lib/observability/errorReporter';
import { queryClient, queryKeys } from '@core/lib/state/queryClient';

describe('queryKeys', () => {
  afterEach(() => {
    queryClient.clear();
    setErrorReporter(undefined);
  });
  it('builds every user and portfolio key', () => {
    expect(queryKeys.user.byWallet('0xabc')).toEqual([
      'user',
      'by-wallet',
      '0xabc',
    ]);
    expect(queryKeys.user.byId('user-1')).toEqual(['user', 'by-id', 'user-1']);
    expect(queryKeys.user.bundleWallets('user-1')).toEqual([
      'user',
      'bundle-wallets',
      'user-1',
    ]);
    expect(queryKeys.user.wallets('user-1')).toEqual([
      'user-wallets',
      'user-1',
    ]);

    expect(queryKeys.portfolio.summary('user-1')).toEqual([
      'portfolio',
      'summary',
      'user-1',
    ]);
    expect(queryKeys.portfolio.analytics('user-1')).toEqual([
      'portfolio',
      'analytics',
      'user-1',
    ]);
    expect(queryKeys.portfolio.apr('user-1')).toEqual([
      'portfolio',
      'apr',
      'user-1',
    ]);
    expect(queryKeys.portfolio.landingPage('user-1')).toEqual([
      'portfolio',
      'landing-page',
      'user-1',
    ]);
    expect(queryKeys.portfolio.yieldSummary('user-1')).toEqual([
      'portfolio',
      'yield-summary',
      'user-1',
      'bundle',
    ]);
    expect(queryKeys.portfolio.yieldSummary('user-1', '0xabc')).toEqual([
      'portfolio',
      'yield-summary',
      'user-1',
      '0xabc',
    ]);
    expect(queryKeys.portfolio.borrowingPositions('user-1')).toEqual([
      'portfolio',
      'borrowing-positions',
      'user-1',
    ]);
  });

  it('builds strategy, token, market, and analytics keys', () => {
    const config = { enabled: true };
    expect(queryKeys.strategies.lists()).toEqual(['strategies', 'list']);
    expect(queryKeys.strategies.list(config)).toEqual([
      'strategies',
      'list',
      config,
    ]);
    expect(queryKeys.strategies.withPortfolio('user-1', config)).toEqual([
      'strategies',
      'list',
      'portfolio',
      'user-1',
      config,
    ]);
    expect(
      queryKeys.balances.list(8453, '0xabc', ['0x1', '0x2'], true),
    ).toEqual(['tokenBalances', 8453, '0xabc', ['0x1', '0x2'], true]);
    expect(queryKeys.prices.list('BTC,ETH')).toEqual([
      'tokenPrices',
      'BTC,ETH',
    ]);
    expect(queryKeys.zapTokens.byChain(8453)).toEqual(['zapTokens', 8453]);
    expect(queryKeys.sentiment.market()).toEqual(['sentiment', 'market']);
    expect(queryKeys.sentiment.regimeHistory()).toEqual([
      'sentiment',
      'regime-history',
    ]);
    expect(queryKeys.portfolioDashboard.byUser('user-1')).toEqual([
      'portfolio-dashboard',
      'user-1',
    ]);
    expect(
      queryKeys.portfolioDashboard.detail('user-1', {
        trend_days: 30,
        drawdown_days: 60,
        rolling_days: 90,
        metrics: ['sharpe'],
        wallet_address: '0xabc',
      }),
    ).toEqual([
      'portfolio-dashboard',
      'user-1',
      30,
      60,
      90,
      ['sharpe'],
      '0xabc',
    ]);
    expect(queryKeys.dailyYield.byUser('user-1')).toEqual([
      'dailyYield',
      'user-1',
    ]);
    expect(queryKeys.dailyYield.list('user-1', 30, null)).toEqual([
      'dailyYield',
      'user-1',
      30,
      null,
    ]);
  });

  it('builds every desktop-host key', () => {
    expect(queryKeys.desktop.portfolio.dailyYieldByUser('user-1')).toEqual([
      'desktop',
      'portfolio',
      'dailyYield',
      'user-1',
    ]);
    expect(queryKeys.desktop.portfolio.dailyYield('user-1', 30)).toEqual([
      'desktop',
      'portfolio',
      'dailyYield',
      'user-1',
      30,
    ]);
    expect(queryKeys.desktop.strategySuggestion('user-1')).toEqual([
      'desktop',
      'strategy-suggestion',
      'user-1',
    ]);
    expect(queryKeys.desktop.defaultBacktest('default')).toEqual([
      'desktop',
      'strategy',
      'default-backtest',
      'default',
    ]);
    expect(queryKeys.desktop.walletAssets(['0x1', '0x2'])).toEqual([
      'desktop',
      'alchemy',
      'wallet-assets',
      ['0x1', '0x2'],
    ]);
    expect(queryKeys.desktop.walletHistory(['0x1'])).toEqual([
      'desktop',
      'moralis',
      'wallet-history',
      ['0x1'],
    ]);
    expect(queryKeys.desktop.podcast.episodes('ja')).toEqual([
      'desktop',
      'podcast',
      'episodes',
      'ja',
    ]);
    expect(queryKeys.desktop.podcast.catalog()).toEqual([
      'desktop',
      'podcast',
      'episodes',
      'catalog',
    ]);
    expect(queryKeys.desktop.podcast.episodeDetail('ja', 'episode-1')).toEqual([
      'desktop',
      'podcast',
      'episodes',
      'detail',
      'ja',
      'episode-1',
    ]);
    expect(queryKeys.desktop.podcast.episodeSearch('ja', 'bitcoin')).toEqual([
      'desktop',
      'podcast',
      'episodes',
      'search',
      'ja',
      'bitcoin',
    ]);
  });

  it('reports non-client query failures and ignores 4xx failures', async () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);

    await expect(
      queryClient.fetchQuery({
        queryKey: ['failure', 'server'],
        retry: false,
        queryFn: async () => Promise.reject(new Error('server exploded')),
      }),
    ).rejects.toThrow('server exploded');
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'server exploded' }),
      {
        scope: 'react-query',
        extra: { queryKey: ['failure', 'server'] },
      },
    );

    reporter.mockClear();
    await expect(
      queryClient.fetchQuery({
        queryKey: ['failure', 'client'],
        retry: false,
        queryFn: async () => Promise.reject(new APIError('bad request', 400)),
      }),
    ).rejects.toThrow('bad request');
    expect(reporter).not.toHaveBeenCalled();
  });

  it('exports the configured shared QueryClient', () => {
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    });
    expect(queryClient.getDefaultOptions().mutations).toMatchObject({
      retry: 1,
    });
  });
});
