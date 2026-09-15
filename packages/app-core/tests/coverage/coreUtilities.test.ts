import {
  getDisplayChain,
  getExplorerAddressUrl,
  getExplorerTxUrl,
  HYPERCORE_CHAIN_ID,
} from '@core/config/chains/display';
import { getQuoteForSentiment } from '@core/config/sentimentQuotes';
import { buildAnalyticsQueryString } from '@core/lib/analytics/queryStringUtils';
import { generateBundleUrl, isOwnBundle } from '@core/lib/bundle/bundleUtils';
import { normalizeSpotAsset } from '@core/lib/domain/spotAsset';
import {
  buildTradeActions,
  formatRegimeLabel,
  getStatusPanelContent,
} from '@core/services/suggestion/suggestionTransformers';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeSuggestion({
  status = 'no_action',
  reasonCode = 'already_aligned',
  transfers = [],
  targetSpotAsset,
}: {
  status?: 'action_required' | 'blocked' | 'no_action';
  reasonCode?: string;
  transfers?: Array<{
    from_bucket: 'stable' | 'btc' | 'eth' | 'spy' | 'spot';
    to_bucket: 'stable' | 'btc' | 'eth' | 'spy' | 'spot';
    amount_usd: number;
  }>;
  targetSpotAsset?: unknown;
}) {
  return {
    context: {
      strategy: {
        details:
          targetSpotAsset === undefined
            ? {}
            : { target_spot_asset: targetSpotAsset },
      },
    },
    action: {
      status,
      reason_code: reasonCode,
      transfers,
    },
  } as Parameters<typeof buildTradeActions>[0];
}

describe('low-level app-core utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes supported spot assets and rejects invalid inputs', () => {
    expect(normalizeSpotAsset(' btc ')).toBe('BTC');
    expect(normalizeSpotAsset('ETH')).toBe('ETH');
    expect(normalizeSpotAsset('spy')).toBe('SPY');
    expect(normalizeSpotAsset('SOL')).toBeNull();
    expect(normalizeSpotAsset(null)).toBeNull();
  });

  it('builds analytics query strings from all supported parameter classes', () => {
    expect(buildAnalyticsQueryString({})).toBe('');
    expect(
      buildAnalyticsQueryString({
        trend_days: 0,
        risk_days: 30,
        drawdown_days: 60,
        allocation_days: 90,
        rolling_days: 120,
        metrics: ['sharpe', 'volatility'],
        wallet_address: '0xabc',
      }),
    ).toBe(
      '?trend_days=0&risk_days=30&drawdown_days=60&allocation_days=90&rolling_days=120&metrics=sharpe%2Cvolatility&wallet_address=0xabc',
    );
    expect(buildAnalyticsQueryString({ metrics: [], wallet_address: '' })).toBe(
      '',
    );
  });

  it('generates relative and absolute bundle URLs and detects ownership', () => {
    expect(generateBundleUrl('user 1')).toBe('/bundle?userId=user+1');
    expect(generateBundleUrl('user', 'wallet')).toBe(
      '/bundle?userId=user&walletId=wallet',
    );
    expect(generateBundleUrl('user', undefined, 'https://example.com')).toBe(
      'https://example.com/bundle?userId=user',
    );
    expect(isOwnBundle('user', 'user')).toBe(true);
    expect(isOwnBundle('user', 'other')).toBe(false);
    expect(isOwnBundle('user', null)).toBe(false);
    expect(isOwnBundle('user')).toBe(false);
  });

  it('resolves display-chain metadata, explorer URLs, and unknown chains', () => {
    const ethereum = getDisplayChain(1);
    expect(ethereum?.id).toBe(1);
    expect(getExplorerTxUrl(1, '0xtx')).toContain('/tx/0xtx');
    expect(getExplorerAddressUrl(1, '0xaddress')).toContain(
      '/address/0xaddress',
    );

    const hypercore = getDisplayChain(HYPERCORE_CHAIN_ID);
    expect(hypercore?.name).toBe('Hyperliquid');
    expect(getExplorerTxUrl(HYPERCORE_CHAIN_ID, 'abc')).toBe(
      'https://app.hyperliquid.xyz/explorer/tx/abc',
    );
    expect(getExplorerAddressUrl(HYPERCORE_CHAIN_ID, 'def')).toBe(
      'https://app.hyperliquid.xyz/explorer/address/def',
    );

    expect(getDisplayChain(-1)).toBeNull();
    expect(getExplorerTxUrl(-1, 'x')).toBeNull();
    expect(getExplorerAddressUrl(-1, 'x')).toBeNull();
  });

  it('returns deterministic sentiment quotes across all sentiment bands', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(getQuoteForSentiment(Number.NaN).sentiment).toBe('Neutral');
    expect(getQuoteForSentiment(-5).sentiment).toBe('Extreme Fear');
    expect(getQuoteForSentiment(25).sentiment).toBe('Fear');
    expect(getQuoteForSentiment(50).sentiment).toBe('Neutral');
    expect(getQuoteForSentiment(60).sentiment).toBe('Greed');
    expect(getQuoteForSentiment(101).sentiment).toBe('Extreme Greed');

    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(getQuoteForSentiment(10).quote).toContain('Opportunities');
  });
});

describe('suggestion transformers', () => {
  it('formats missing and underscored regime labels', () => {
    expect(formatRegimeLabel(undefined)).toBe('unknown');
    expect(formatRegimeLabel(null)).toBe('unknown');
    expect(formatRegimeLabel('extreme_greed')).toBe('extreme greed');
  });

  it('derives buy/sell actions and labels every supported bucket', () => {
    const data = makeSuggestion({
      targetSpotAsset: ' eth ',
      transfers: [
        { from_bucket: 'stable', to_bucket: 'btc', amount_usd: 10 },
        { from_bucket: 'eth', to_bucket: 'stable', amount_usd: 20 },
        { from_bucket: 'spy', to_bucket: 'spot', amount_usd: 30 },
        { from_bucket: 'spot', to_bucket: 'spy', amount_usd: 40 },
      ],
    });

    expect(buildTradeActions(data)).toEqual([
      {
        action: 'buy',
        bucket: 'btc',
        bucketLabel: 'BTC',
        amount_usd: 10,
        description: 'STABLE -> BTC',
      },
      {
        action: 'sell',
        bucket: 'eth',
        bucketLabel: 'ETH',
        amount_usd: 20,
        description: 'ETH -> STABLE',
      },
      {
        action: 'buy',
        bucket: 'spot',
        bucketLabel: 'ETH',
        amount_usd: 30,
        description: 'SPY -> ETH',
      },
      {
        action: 'buy',
        bucket: 'spy',
        bucketLabel: 'SPY',
        amount_usd: 40,
        description: 'ETH -> SPY',
      },
    ]);
  });

  it('falls back to SPOT when the configured target asset is invalid', () => {
    const [action] = buildTradeActions(
      makeSuggestion({
        targetSpotAsset: 'SOL',
        transfers: [
          { from_bucket: 'stable', to_bucket: 'spot', amount_usd: 12 },
        ],
      }),
    );
    expect(action?.bucketLabel).toBe('SPOT');
    expect(action?.description).toBe('STABLE -> SPOT');
  });

  it('builds action-required status content with singular/plural counts', () => {
    const one = getStatusPanelContent(
      makeSuggestion({ status: 'action_required' }),
      [
        {
          action: 'buy',
          bucket: 'btc',
          bucketLabel: 'BTC',
          amount_usd: 1,
          description: 'STABLE -> BTC',
        },
      ],
    );
    expect(one.actionCardTitle).toBe('1 Action');
    expect(one.ctaDisabled).toBe(false);

    expect(
      getStatusPanelContent(makeSuggestion({ status: 'action_required' }), [
        {
          action: 'buy',
          bucket: 'btc',
          bucketLabel: 'BTC',
          amount_usd: 1,
          description: 'STABLE -> BTC',
        },
        {
          action: 'buy',
          bucket: 'eth',
          bucketLabel: 'ETH',
          amount_usd: 1,
          description: 'STABLE -> ETH',
        },
      ]).actionCardTitle,
    ).toBe('2 Actions');
  });

  it('humanizes blocked and no-action reason codes', () => {
    const blocked = getStatusPanelContent(
      makeSuggestion({ status: 'blocked', reasonCode: 'interval_wait' }),
      [],
    );
    expect(blocked.actionCardTitle).toBe('Action Blocked');
    expect(blocked.bodyDescription).toContain('Minimum rebalance interval');
    expect(blocked.ctaDisabled).toBe(true);

    const noAction = getStatusPanelContent(
      makeSuggestion({ reasonCode: 'custom_reason_code' }),
      [],
    );
    expect(noAction.actionCardTitle).toBe('0 Actions');
    expect(noAction.bodyDescription).toBe('Custom reason code.');
    expect(noAction.ctaLabel).toBe('No Action Needed');
  });
});
