import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LandingPageResponse } from '../src/services';
import type { BacktestTimelinePoint } from '../src/types/backtesting';
import { sampleTimelineData } from '../src/services/backtestingTimelineService';
import { extractROIChanges } from '../src/lib/portfolio/portfolioUtils';
import { transformToWalletPortfolioData } from '../src/adapters/walletPortfolioDataAdapter';
import { extractBalanceData } from '../src/lib/portfolio/portfolioTransformers';
import { buildWalletChain } from '../src/providers/walletProviderUtils';
import {
  depositWizardReducer,
  initialDepositWizardState,
} from '../src/lib/wallet/depositWizardMachine';
import {
  hyperliquidAgentReducer,
  initialHyperliquidAgentState,
} from '../src/lib/wallet/hyperliquidAgentMachine';
import { getDefaultQuoteForRegime } from '../src/lib/domain/regime';
import { isClientError, isNotFoundError } from '../src/lib/errors/errorHelpers';
import { formatCurrency } from '../src/utils/formatting/currencyNumber';

const zeroCategory = {
  total_value: 0,
  percentage_of_portfolio: 0,
  wallet_tokens_value: 0,
  other_sources_value: 0,
};

const landing = (
  portfolioRoi?: LandingPageResponse['portfolio_roi'],
): LandingPageResponse => ({
  total_net_usd: 0,
  net_portfolio_value: 0,
  portfolio_allocation: {
    btc: zeroCategory,
    eth: zeroCategory,
    stablecoins: zeroCategory,
    others: zeroCategory,
  },
  ...(portfolioRoi ? { portfolio_roi: portfolioRoi } : {}),
});

const timelinePoint = (
  date: string,
  hasTransfer = false,
): BacktestTimelinePoint =>
  ({
    market: {
      date,
      token_price: {},
      sentiment: null,
      sentiment_label: null,
    },
    strategies: {
      primary: {
        portfolio: {},
        signal: null,
        decision: {},
        execution: {
          event: null,
          transfers: hasTransfer ? [{}] : [],
          blocked_reason: null,
          step_count: 0,
          steps_remaining: 0,
          interval_days: 0,
        },
      },
    },
  }) as BacktestTimelinePoint;

describe('coverage handoff: pure app-core boundary behavior', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns an already-small timeline by identity', () => {
    const timeline = [timelinePoint('2026-01-01'), timelinePoint('2026-01-02')];
    expect(sampleTimelineData(timeline, 'primary', 2)).toBe(timeline);
  });

  it('samples hold days while preserving endpoint and transfer days', () => {
    const timeline = Array.from({ length: 8 }, (_, index) =>
      timelinePoint(
        `2026-01-${String(index + 1).padStart(2, '0')}`,
        index === 3,
      ),
    );
    expect(
      sampleTimelineData(timeline, 'primary', 5).map(
        (point: any) => point.date,
      ),
    ).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-04',
      '2026-01-07',
      '2026-01-08',
    ]);
  });

  it('retains independent zero defaults for partially populated ROI windows', () => {
    expect(
      extractROIChanges(
        landing({
          windows: {
            '7d': { value: 0, data_points: 0 },
            '30d': { value: 3, data_points: 1 },
          },
        } as LandingPageResponse['portfolio_roi']),
      ),
    ).toEqual({ change7d: 0, change30d: 3 });
    expect(
      extractROIChanges(
        landing({
          windows: { '7d': { value: 2, data_points: 1 } },
        } as LandingPageResponse['portfolio_roi']),
      ),
    ).toEqual({ change7d: 2, change30d: 0 });
  });

  it('defaults absent portfolio balances in both public transformers', () => {
    const input = landing();
    expect(transformToWalletPortfolioData(input, null).balance).toBe(0);
    expect(extractBalanceData(input).balance).toBe(0);
  });

  it('builds a stable display chain when optional metadata is absent', () => {
    expect(buildWalletChain({ id: 8453 })).toEqual({
      id: 8453,
      name: 'Chain 8453',
      symbol: 'ETH',
    });
  });

  it('leaves reducer state unchanged for a future unknown event', () => {
    expect(
      depositWizardReducer(initialDepositWizardState, {
        type: 'FUTURE_EVENT',
      } as never),
    ).toBe(initialDepositWizardState);
    expect(
      hyperliquidAgentReducer(initialHyperliquidAgentState, {
        type: 'FUTURE_EVENT',
      } as never),
    ).toBe(initialHyperliquidAgentState);
  });

  it('falls back for an unknown regime supplied across an untyped boundary', () => {
    expect(getDefaultQuoteForRegime('future' as never)).toBe(
      getDefaultQuoteForRegime('n'),
    );
  });

  it('recognizes only numeric status fields without requiring Error subclasses', () => {
    expect(isClientError({ status: 400 })).toBe(true);
    expect(isNotFoundError({ status: 404 })).toBe(true);
    expect(isClientError({ status: '400' })).toBe(false);
    expect(isNotFoundError({ status: '404' })).toBe(false);
  });

  it('uses currency defaults when both optional flags are omitted', () => {
    expect(formatCurrency(0.005, {})).toBe('$0.01');
    expect(formatCurrency(-1, {})).toContain('-');
  });
});
