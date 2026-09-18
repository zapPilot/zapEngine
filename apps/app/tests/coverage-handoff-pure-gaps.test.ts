import { describe, expect, it } from 'vitest';
import {
  amountUsdFromInput,
  normalizeAmountInput,
  quickAmountUsdInput,
  singleChainFromAmount,
  usd6ToAmountInput,
} from '../src/integration/investAmountModel';
import {
  baseUnitsToUsdcInput,
  bridgeBalanceQueryKey,
  bridgeChain,
  normalizeUsdcInput,
  percentOfBaseUnits,
} from '../src/integration/bridgeTestModel';
import {
  buildConnectedWallets,
  getNativeWalletChain,
  resolveEmbeddedWalletId,
  toWalletError,
} from '../src/integration/walletBackendModel';
import {
  formatGmxExecutionFee,
  formatPlanGas,
  gmxExecutionFeeWei,
} from '../src/integration/planPreviewFormatters';
import {
  buildHomeBorrowingRiskView,
  liquidationBufferPctFromHealthRate,
} from '../src/integration/homeBorrowingRiskModel';
import {
  parseStoredVideoDownloads,
  resolveOfflineEpisodeVideo,
  videoDownloadFileNames,
} from '../src/integration/podcastVideoDownloads';
import {
  calculateAdjacentSnapshotChange,
  calculateWindowValueChangePct,
  netPortfolioValueFrom,
  nearestTrendPointIndex,
  snapshotCategoryTotals,
  trendPointX,
} from '../src/integration/portfolioMetrics';
import {
  calculateHomeRangeChange,
  sliceHomeDailyValuesForRange,
} from '../src/integration/useHomeData';
import {
  DEFAULT_SECTOR_WEIGHTS,
  isValidSectorWeights,
  rebalanceSectorWeights,
} from '../src/integration/investSectorModel';

describe('coverage handoff: app pure boundaries', () => {
  it('normalizes amount edge cases and clamps quick percentages', () => {
    expect(normalizeAmountInput('abc')).toBe('');
    expect(normalizeAmountInput('0001000.1234567')).toBe('1,000.123456');
    expect(usd6ToAmountInput(0n)).toBe('');
    expect(quickAmountUsdInput(null, 5000)).toBe('');
    expect(quickAmountUsdInput(10_000_000n, 20_000)).toBe('10');
    expect(amountUsdFromInput('no amount')).toBeNull();
  });

  it('rejects unsupported or unusable single-chain funding amounts', () => {
    const token = (symbol: string, decimals: number) =>
      ({ symbol, decimals, chainId: 1 }) as never;
    expect(
      singleChainFromAmount({
        totalUsd6: 'bad',
        token: token('USDC', 6),
        usdPrice: 1,
      }),
    ).toBeNull();
    expect(
      singleChainFromAmount({
        totalUsd6: '0',
        token: token('USDC', 6),
        usdPrice: 1,
      }),
    ).toBeNull();
    expect(
      singleChainFromAmount({
        totalUsd6: '1',
        token: token('BTC', 8),
        usdPrice: 1,
      }),
    ).toBeNull();
    expect(
      singleChainFromAmount({
        totalUsd6: '1',
        token: token('ETH', 18),
        usdPrice: null,
      }),
    ).toBeNull();
    expect(
      singleChainFromAmount({
        totalUsd6: '1',
        token: token('ETH', 18),
        usdPrice: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });

  it('covers bridge formatting and missing-account query identity', () => {
    expect(normalizeUsdcInput('1,2x.3456789')).toBe('12.345678');
    expect(percentOfBaseUnits(null, 5000)).toBe('0');
    expect(baseUnitsToUsdcInput('')).toBe('0');
    expect(
      bridgeBalanceQueryKey({
        address: null,
        chainId: 1,
        tokenAddress: '0xABC',
        kind: 'gas',
      })[3],
    ).toBe('no-account');
    expect(() => bridgeChain(-1)).toThrow('Unsupported bridge chain');
  });

  it('handles absent and malformed native wallet metadata', () => {
    expect(resolveEmbeddedWalletId(null, null)).toBeUndefined();
    expect(
      resolveEmbeddedWalletId(
        [null, { connector_type: 'external' }],
        '0x0000000000000000000000000000000000000001',
      ),
    ).toBeUndefined();
    expect(getNativeWalletChain(999_999)).toBe(getNativeWalletChain(null));
    expect(buildConnectedWallets(null)).toEqual([]);
    expect(toWalletError({ reason: 'unknown' })).toEqual({
      message: '[object Object]',
    });
  });

  it('ignores malformed GMX fee metadata and invalid gas totals', () => {
    const calls = [
      { meta: { route: null } },
      { meta: { route: [] } },
      { meta: { route: { executionFeeWei: 'bad' } } },
      { meta: { route: { executionFeeWei: '10' } } },
    ] as never;
    expect(gmxExecutionFeeWei(undefined)).toBeNull();
    expect(gmxExecutionFeeWei(calls)).toBe(10n);
    expect(formatGmxExecutionFee(undefined)).toBe('—');
    expect(formatPlanGas(undefined)).toBe('—');
  });

  it('sorts borrowing positions and defaults an unexpectedly empty first slot', () => {
    expect(liquidationBufferPctFromHealthRate(Number.NaN)).toBe(0);
    expect(liquidationBufferPctFromHealthRate(0.5)).toBe(0);
    expect(liquidationBufferPctFromHealthRate(2)).toBe(50);
    expect(buildHomeBorrowingRiskView(undefined)).toBeNull();
    expect(buildHomeBorrowingRiskView({ positions: [] } as never)).toBeNull();
  });

  it('rejects malformed download records including invalid URI identifiers', () => {
    expect(parseStoredVideoDownloads('{')).toEqual([]);
    expect(parseStoredVideoDownloads('{}')).toEqual([]);
    expect(
      parseStoredVideoDownloads(
        JSON.stringify([
          {
            localizationId: '\ud800',
            episodeId: 'e',
            title: 't',
            languageCode: 'en',
            createdAt: '2026-01-01',
            downloadedAt: '2026-01-01',
            durationSeconds: 1,
            byteSize: 1,
            videoFileName: 'x',
            thumbnailFileName: 'y',
          },
        ]),
      ),
    ).toEqual([]);
    expect(resolveOfflineEpisodeVideo(null, undefined, String)).toBeNull();
    expect(videoDownloadFileNames('a_b').video).toContain('_5F');
  });

  it('covers portfolio missing, zero, and invalid geometry branches', () => {
    expect(netPortfolioValueFrom(undefined)).toBeNull();
    expect(
      netPortfolioValueFrom({
        net_portfolio_value: null,
        total_net_usd: 7,
      } as never),
    ).toBe(7);
    expect(
      calculateAdjacentSnapshotChange([
        { total_value_usd: 0 },
        { total_value_usd: 1 },
      ]),
    ).toEqual({ usd: 1, pct: null });
    expect(
      calculateWindowValueChangePct([{ date: 'bad', total_value_usd: 1 }], 7),
    ).toBeNull();
    expect(
      snapshotCategoryTotals({
        categories: [{ assets_usd: Number.NaN, debt_usd: 2 }],
      }),
    ).toEqual({ debtUsd: 2 });
    expect(nearestTrendPointIndex(Number.NaN, 100, 2)).toBeNull();
    expect(nearestTrendPointIndex(10, 100, 1)).toBe(0);
    expect(trendPointX(1, 0, 2)).toBe(0);
  });

  it('falls back safely for sparse home ranges and invalid sector edits', () => {
    expect(calculateHomeRangeChange([])).toBeNull();
    expect(
      sliceHomeDailyValuesForRange([{ date: 'bad', total_value_usd: 1 }], '1W'),
    ).toHaveLength(1);
    expect(
      isValidSectorWeights({ crypto: 4000.5, stable: 5999.5, sp500: 0 }),
    ).toBe(false);
    expect(rebalanceSectorWeights(DEFAULT_SECTOR_WEIGHTS, 'sp500', 5000)).toBe(
      DEFAULT_SECTOR_WEIGHTS,
    );
  });
});
