import { describe, expect, it, vi } from 'vitest';

import type { IndicatorKey } from '@/components/wallet/portfolio/views/backtesting/components/backtestChartLegendData';
import { buildBacktestTooltipData } from '@/components/wallet/portfolio/views/backtesting/utils/backtestTooltipDataUtils';

vi.mock('@/utils', () => ({
  formatCurrency: (value: number) => `$${Math.round(value).toLocaleString()}`,
}));

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

function makeMarket(
  date = '2026-01-15',
  sentiment_label: string | null = 'fear',
  macro_fear_greed:
    | {
        score: number;
        label?: string | null;
        source: string;
        updated_at: string;
        raw_rating?: string | null;
      }
    | null
    | undefined = undefined,
) {
  return {
    date,
    sentiment_label,
    ...(macro_fear_greed !== undefined ? { macro_fear_greed } : {}),
  };
}

function makeStrategyPoint(overrides: {
  spot?: number;
  stable?: number;
  spotAsset?: 'BTC' | 'ETH' | 'SPY' | null;
  allocation?: {
    btc?: number;
    eth?: number;
    spy?: number;
    stable?: number;
    alt?: number;
  };
  signal?: object | null;
  decision?: {
    action: string;
    reason: string;
    details?: { target_spot_asset?: unknown };
  };
  blocked_reason?: string | null;
  buy_gate?: { block_reason: string | null } | null;
}) {
  const spotUsd = overrides.spot ?? 5000;
  const stableUsd = overrides.stable ?? 5000;
  const totalValue = spotUsd + stableUsd;
  const spotShare = totalValue > 0 ? spotUsd / totalValue : 0;
  const stableShare = totalValue > 0 ? stableUsd / totalValue : 0;
  const defaultAllocation = {
    btc:
      overrides.spotAsset === 'BTC' || overrides.spotAsset === undefined
        ? spotShare
        : 0,
    eth: overrides.spotAsset === 'ETH' ? spotShare : 0,
    spy: overrides.spotAsset === 'SPY' ? spotShare : 0,
    stable: stableShare,
    alt: 0,
  };

  return {
    portfolio: {
      spot_usd: spotUsd,
      stable_usd: stableUsd,
      total_value: totalValue,
      ...(overrides.spotAsset !== undefined && {
        spot_asset: overrides.spotAsset,
      }),
      allocation: {
        spot: spotShare,
        stable: stableShare,
      },
      asset_allocation: {
        ...defaultAllocation,
        ...overrides.allocation,
      },
    },
    signal:
      overrides.signal !== undefined
        ? overrides.signal
        : { id: 'dma_gated_fgi' },
    decision: overrides.decision ?? { action: 'hold', reason: 'baseline' },
    execution: {
      event: null,
      transfers: [],
      blocked_reason: overrides.blocked_reason ?? null,
      step_count: 0,
      steps_remaining: 0,
      interval_days: 0,
      ...(overrides.buy_gate !== undefined
        ? {
            diagnostics: {
              plugins: {
                dma_buy_gate: overrides.buy_gate,
              },
            },
          }
        : {}),
    },
  };
}

/**
 * Builds a minimal single-entry payload. All other signal/event entries can be
 * appended when testing those specific branches.
 */
function minimalPayload(
  market = makeMarket(),
  strategies: Record<string, object> = {},
) {
  return [
    {
      name: 'strategy_a',
      value: 10000,
      color: '#3b82f6',
      payload: {
        market,
        eventStrategies: { buy_spot: [], sell_spot: [] },
        strategies,
      },
    },
  ];
}

// Full payload used across multiple tests (mirrors original fixture)
function createTooltipPayload() {
  return [
    {
      name: 'DMA Gated FGI Default',
      value: 12000,
      color: '#3b82f6',
      payload: {
        market: makeMarket(),
        eventStrategies: {
          buy_spot: ['DMA Gated FGI Default'],
          sell_spot: [],
        },
        strategies: {
          dca_classic: makeStrategyPoint({
            spot: 5000,
            stable: 5000,
            signal: null,
          }),
          dma_gated_fgi_default: makeStrategyPoint({
            spot: 9600,
            stable: 2400,
            spotAsset: 'ETH',
            signal: { id: 'dma_gated_fgi' },
            decision: {
              action: 'buy',
              reason: 'below_extreme_fear_buy',
              details: {
                target_spot_asset: 'ETH',
              },
            },
            blocked_reason: 'cooldown_active',
            buy_gate: { block_reason: 'sideways_pending' },
          }),
        },
      },
    },
    {
      name: 'Sentiment',
      value: 25,
      color: '#f59e0b',
      payload: { market: makeMarket() },
    },
    {
      name: 'BTC Price',
      value: 60000,
      color: '#22c55e',
      payload: {},
    },
    {
      name: 'DMA 200',
      value: 50000,
      color: '#38bdf8',
      payload: {},
    },
    {
      name: 'Buy Spot',
      value: 12000,
      color: '#22c55e',
      payload: {},
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildBacktestTooltipData', () => {
  // ------------------------------------------------------------------
  // Early-exit guard
  // ------------------------------------------------------------------

  describe('early-exit when payload is absent or empty', () => {
    it('returns null when payload is undefined', () => {
      expect(buildBacktestTooltipData({ payload: undefined })).toBeNull();
    });

    it('returns null when payload is an empty array', () => {
      expect(buildBacktestTooltipData({ payload: [] })).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // Date derivation
  // ------------------------------------------------------------------

  describe('date string derivation', () => {
    it('uses market.date when available, ignoring label', () => {
      const result = buildBacktestTooltipData({
        payload: createTooltipPayload(),
        label: '2026-01-01',
      });
      expect(result?.dateStr).toBe(new Date('2026-01-15').toLocaleDateString());
    });

    it('falls back to label when market.date is absent', () => {
      const payload = [
        {
          name: 'strategy_a',
          value: 10000,
          color: '#3b82f6',
          payload: {
            // no market property at all
            strategies: {},
            eventStrategies: {},
          },
        },
      ];
      const label = '2025-06-01';
      const result = buildBacktestTooltipData({ payload, label });
      expect(result?.dateStr).toBe(new Date(label).toLocaleDateString());
    });
  });

  // ------------------------------------------------------------------
  // getOrderedStrategyIds — branch: no sortedStrategyIds supplied
  // ------------------------------------------------------------------

  describe('getOrderedStrategyIds', () => {
    it('returns strategy keys in natural object order when sortedStrategyIds is absent', () => {
      const strategies = {
        strategy_b: makeStrategyPoint({}),
        strategy_a: makeStrategyPoint({}),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        // sortedStrategyIds intentionally omitted
      });
      // Allocations mirror orderedIds order; both have non-zero spot/stable
      const ids = result?.sections.allocations.map((a) => a.id) ?? [];
      expect(ids).toEqual(['strategy_b', 'strategy_a']);
    });

    it('only includes strategies present in sortedStrategyIds', () => {
      const strategies = {
        strategy_a: makeStrategyPoint({}),
        strategy_b: makeStrategyPoint({}),
        strategy_c: makeStrategyPoint({}),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['strategy_c', 'strategy_a'],
      });
      const ids = result?.sections.allocations.map((a) => a.id) ?? [];
      // strategy_b is excluded because it's not in sortedStrategyIds
      expect(ids).toEqual(['strategy_c', 'strategy_a']);
    });
  });

  // ------------------------------------------------------------------
  // hasAllocationData — zero-allocation branch returns null block
  // ------------------------------------------------------------------

  describe('buildAllocationBlock / hasAllocationData', () => {
    it('excludes a strategy whose allocation is all zeros (spot=0, stable=0)', () => {
      const strategies = {
        zero_alloc: makeStrategyPoint({ spot: 0, stable: 0 }),
        normal: makeStrategyPoint({ spot: 5000, stable: 5000 }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['zero_alloc', 'normal'],
      });
      const ids = result?.sections.allocations.map((a) => a.id) ?? [];
      expect(ids).not.toContain('zero_alloc');
      expect(ids).toContain('normal');
    });

    it('includes a strategy whose only spot > 0 (stable = 0)', () => {
      const strategies = {
        spot_only: makeStrategyPoint({ spot: 8000, stable: 0 }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
      });
      const ids = result?.sections.allocations.map((a) => a.id) ?? [];
      expect(ids).toContain('spot_only');
    });

    it('includes a strategy whose only stable > 0 (spot = 0)', () => {
      const strategies = {
        stable_only: makeStrategyPoint({ spot: 0, stable: 6000 }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
      });
      const ids = result?.sections.allocations.map((a) => a.id) ?? [];
      expect(ids).toContain('stable_only');
    });

    it('uses the five-bucket asset allocation for allocation blocks', () => {
      const strategies = {
        rotation: makeStrategyPoint({
          spot: 8000,
          stable: 2000,
          spotAsset: 'ETH',
          allocation: { btc: 0.1, eth: 0.5, spy: 0.2, stable: 0.2, alt: 0 },
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
      });

      expect(result?.sections.allocations[0]?.allocation).toEqual({
        btc: 0.1,
        eth: 0.5,
        spy: 0.2,
        stable: 0.2,
        alt: 0,
      });
    });

    it('sets index to -1 when sortedStrategyIds is undefined (indexOf not found)', () => {
      const strategies = {
        my_strategy: makeStrategyPoint({ spot: 1000, stable: 1000 }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        // no sortedStrategyIds → index becomes undefined via optional chaining
      });
      expect(result?.sections.allocations[0]?.index).toBeUndefined();
    });

    it('keeps stable-only allocations free of spot asset detail', () => {
      const strategies = {
        stable_only: makeStrategyPoint({
          spot: 0,
          stable: 6000,
          spotAsset: 'ETH',
          decision: {
            action: 'sell',
            reason: 'go_stable',
            details: {
              target_spot_asset: 'ETH',
            },
          },
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['stable_only'],
      });

      const detailNames = (result?.sections.details ?? []).map((d) => d.name);
      expect(detailNames).not.toContain('stable only spot asset');
    });
  });

  // ------------------------------------------------------------------
  // formatSentimentValue — "Unknown" branch when sentiment is null/undefined
  // ------------------------------------------------------------------

  describe('formatSentimentValue', () => {
    it("displays 'Unknown' when sentiment_label is null", () => {
      const market = makeMarket('2026-01-15', null);
      const payload = [
        {
          name: 'Sentiment',
          value: 42,
          color: '#f59e0b',
          payload: { market },
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      const sentiment = result?.sections.signals.find(
        (s) => s.name === 'Sentiment',
      );
      expect(sentiment?.value).toBe('Unknown (42)');
    });

    it('capitalizes a provided sentiment_label', () => {
      const market = makeMarket('2026-01-15', 'extreme_greed');
      const payload = [
        {
          name: 'Sentiment',
          value: 90,
          color: '#f59e0b',
          payload: { market },
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      const sentiment = result?.sections.signals.find(
        (s) => s.name === 'Sentiment',
      );
      // Only first character is uppercased; rest is kept as-is
      expect(sentiment?.value).toBe('Extreme_greed (90)');
    });
  });

  describe('formatSignalValue — Macro FGI', () => {
    it('formats macro fear and greed label and score', () => {
      const market = makeMarket('2026-01-15', 'fear', {
        score: 35,
        label: 'fear',
        source: 'cnn_fear_greed_unofficial',
        updated_at: '2026-01-15T12:00:00+00:00',
        raw_rating: 'Fear',
      });
      const payload = [
        {
          name: 'Macro FGI',
          value: 35,
          color: '#14b8a6',
          payload: { market },
        },
      ];

      const result = buildBacktestTooltipData({ payload });
      const macroFgi = result?.sections.signals.find(
        (s) => s.name === 'Macro FGI',
      );

      expect(macroFgi?.value).toBe('Fear (35)');
    });

    it("displays 'Unknown' when macro fear and greed label is absent", () => {
      const market = makeMarket('2026-01-15', 'fear', null);
      const payload = [
        {
          name: 'Macro FGI',
          value: 42,
          color: '#14b8a6',
          payload: { market },
        },
      ];

      const result = buildBacktestTooltipData({ payload });
      const macroFgi = result?.sections.signals.find(
        (s) => s.name === 'Macro FGI',
      );

      expect(macroFgi?.value).toBe('Unknown (42)');
    });

    it('filters macro fear and greed when its indicator is inactive', () => {
      const market = makeMarket('2026-01-15', 'fear', {
        score: 35,
        label: 'fear',
        source: 'cnn_fear_greed_unofficial',
        updated_at: '2026-01-15T12:00:00+00:00',
        raw_rating: 'Fear',
      });
      const payload = [
        {
          name: 'Sentiment',
          value: 25,
          color: '#f59e0b',
          payload: { market },
        },
        {
          name: 'Macro FGI',
          value: 35,
          color: '#14b8a6',
          payload: { market },
        },
      ];

      const result = buildBacktestTooltipData({
        payload,
        activeIndicators: new Set<IndicatorKey>(['sentiment']),
      });

      expect(
        result?.sections.signals.some((signal) => signal.name === 'Macro FGI'),
      ).toBe(false);
      expect(
        result?.sections.signals.some((signal) => signal.name === 'Sentiment'),
      ).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // formatSignalValue — "BTC Price" / "DMA 200" when value is not a number
  // ------------------------------------------------------------------

  describe('formatSignalValue — BTC Price / DMA 200 with undefined value', () => {
    it("returns empty string for 'BTC Price' when value is undefined", () => {
      const payload = [
        {
          name: 'BTC Price',
          value: undefined,
          color: '#22c55e',
          payload: {},
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      const btc = result?.sections.signals.find((s) => s.name === 'BTC Price');
      expect(btc?.value).toBe('');
    });

    it("returns empty string for 'DMA 200' when value is undefined", () => {
      const payload = [
        {
          name: 'DMA 200',
          value: undefined,
          color: '#38bdf8',
          payload: {},
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      const dma = result?.sections.signals.find((s) => s.name === 'DMA 200');
      expect(dma?.value).toBe('');
    });
  });

  // ------------------------------------------------------------------
  // formatSignalValue — VIX (numeric and non-numeric)
  // ------------------------------------------------------------------

  describe('formatSignalValue — VIX signal (non-Sentiment, non-BTC/DMA)', () => {
    it('rounds a numeric VIX value to 2 decimal places', () => {
      const payload = [
        {
          name: 'VIX',
          value: 18.456789,
          color: '#a78bfa',
          payload: {},
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      const vix = result?.sections.signals.find((s) => s.name === 'VIX');
      expect(vix?.value).toBe(18.46);
    });

    it('returns empty string for VIX when value is undefined', () => {
      const payload = [
        {
          name: 'VIX',
          value: undefined,
          color: '#a78bfa',
          payload: {},
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      const vix = result?.sections.signals.find((s) => s.name === 'VIX');
      // value ?? "" → ""
      expect(vix?.value).toBe('');
    });
  });

  // ------------------------------------------------------------------
  // buildTooltipSections — null entry in payload array
  // ------------------------------------------------------------------

  describe('buildTooltipSections — null/falsy entry guard', () => {
    it('skips a null entry in the payload array without throwing', () => {
      const payload = [
        null as unknown as {
          name: string;
          value: number;
          color: string;
          payload: object;
        },
        {
          name: 'strategy_a',
          value: 5000,
          color: '#3b82f6',
          payload: {
            market: makeMarket(),
            strategies: {},
            eventStrategies: {},
          },
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      expect(result).not.toBeNull();
      expect(result?.sections.strategies).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------
  // buildTooltipSections — missing name / color defaults
  // ------------------------------------------------------------------

  describe('buildTooltipSections — entry with missing name or color', () => {
    it('defaults name to empty string when entry.name is absent', () => {
      const payload = [
        {
          // name intentionally absent → treated as unknown strategy
          value: 7500,
          color: '#06b6d4',
          payload: {
            market: makeMarket(),
            strategies: {},
            eventStrategies: {},
          },
        } as unknown as {
          name: string;
          value: number;
          color: string;
          payload: object;
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      // Empty-name entry is not a known signal or event, but has a numeric value
      expect(result?.sections.strategies[0]?.name).toBe('');
    });

    it("defaults color to '#fff' when entry.color is absent", () => {
      const payload = [
        {
          name: 'strategy_x',
          value: 9000,
          // color intentionally absent
          payload: {
            market: makeMarket(),
            strategies: {},
            eventStrategies: {},
          },
        } as unknown as {
          name: string;
          value: number;
          color: string;
          payload: object;
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      expect(result?.sections.strategies[0]?.color).toBe('#fff');
    });
  });

  // ------------------------------------------------------------------
  // buildTooltipSections — event with no eventStrategies record
  // ------------------------------------------------------------------

  describe('buildTooltipSections — event key with missing eventStrategies', () => {
    it('falls back to an empty array when eventStrategies is undefined for event key', () => {
      const payload = [
        {
          name: 'Buy Spot',
          value: 10000,
          color: '#22c55e',
          payload: {
            market: makeMarket(),
            strategies: {},
            // eventStrategies intentionally absent
          },
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      const buyEvent = result?.sections.events.find(
        (e) => e.name === 'Buy Spot',
      );
      expect(buyEvent?.strategies).toEqual([]);
    });

    it('falls back to empty array when eventStrategies exists but key is absent', () => {
      const payload = [
        {
          name: 'Sell Spot',
          value: 10000,
          color: '#ef4444',
          payload: {
            market: makeMarket(),
            strategies: {},
            eventStrategies: {
              // buy_spot present but sell_spot absent
              buy_spot: ['some_strategy'],
            },
          },
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      const sellEvent = result?.sections.events.find(
        (e) => e.name === 'Sell Spot',
      );
      expect(sellEvent?.strategies).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // buildTooltipSections — strategy item skipped when value is not a number
  // ------------------------------------------------------------------

  describe('buildTooltipSections — strategy entry with non-numeric value', () => {
    it('does not push a strategy item when entry.value is undefined', () => {
      const payload = [
        {
          name: 'unknown_strategy',
          value: undefined,
          color: '#3b82f6',
          payload: {
            market: makeMarket(),
            strategies: {},
            eventStrategies: {},
          },
        } as unknown as {
          name: string;
          value: number;
          color: string;
          payload: object;
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      expect(result?.sections.strategies).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------
  // Detail items — decision + blocked + buy-gate
  // ------------------------------------------------------------------

  describe('detail items (decision / blocked / buy gate)', () => {
    it('adds only a decision detail when blocked_reason and buy_gate are null', () => {
      const strategies = {
        my_strat: makeStrategyPoint({
          spot: 0,
          stable: 10000,
          signal: { id: 'dma_gated_fgi' },
          decision: { action: 'hold', reason: 'waiting' },
          blocked_reason: null,
          buy_gate: null,
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['my_strat'],
      });
      const details = result?.sections.details ?? [];
      expect(details).toHaveLength(1);
      expect(details[0]?.name).toMatch(/decision/);
    });

    it('adds decision + blocked detail when blocked_reason is set', () => {
      const strategies = {
        my_strat: makeStrategyPoint({
          signal: { id: 'dma_gated_fgi' },
          decision: { action: 'buy', reason: 'signal' },
          blocked_reason: 'cooldown_active',
          buy_gate: null,
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['my_strat'],
      });
      const details = result?.sections.details ?? [];
      const names = details.map((d) => d.name);
      expect(names).toContain('my strat decision');
      expect(names).toContain('my strat blocked');
    });

    it('adds a spot asset detail from portfolio.spot_asset when available', () => {
      const strategies = {
        my_strat: makeStrategyPoint({
          spotAsset: 'ETH',
          signal: { id: 'dma_gated_fgi' },
          decision: {
            action: 'hold',
            reason: 'rotation',
            details: {
              target_spot_asset: 'btc',
            },
          },
          blocked_reason: null,
          buy_gate: null,
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['my_strat'],
      });
      const details = result?.sections.details ?? [];

      expect(details).toEqual(
        expect.arrayContaining([
          {
            name: 'my strat spot asset',
            value: 'ETH',
            color: '#627EEA',
          },
        ]),
      );
    });

    it('uses canonical allocation instead of legacy target_spot_asset for spot asset details', () => {
      const strategies = {
        my_strat: makeStrategyPoint({
          signal: { id: 'dma_gated_fgi' },
          decision: {
            action: 'hold',
            reason: 'rotation',
            details: {
              target_spot_asset: 'eth',
            },
          },
          blocked_reason: null,
          buy_gate: null,
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['my_strat'],
      });
      const details = result?.sections.details ?? [];

      expect(details).toEqual(
        expect.arrayContaining([
          {
            name: 'my strat spot asset',
            value: 'BTC',
            color: '#F7931A',
          },
        ]),
      );
    });

    it('skips spot asset detail for stable-only points', () => {
      const strategies = {
        my_strat: makeStrategyPoint({
          spot: 0,
          stable: 10000,
          spotAsset: null,
          signal: { id: 'dma_gated_fgi' },
          decision: {
            action: 'sell',
            reason: 'go_stable',
            details: {
              target_spot_asset: 'ETH',
            },
          },
          blocked_reason: null,
          buy_gate: null,
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['my_strat'],
      });
      const detailNames = (result?.sections.details ?? []).map((d) => d.name);

      expect(detailNames).not.toContain('my strat spot asset');
    });

    it('adds buy-gate detail when buy_gate.block_reason is set', () => {
      const strategies = {
        my_strat: makeStrategyPoint({
          signal: { id: 'dma_gated_fgi' },
          decision: { action: 'buy', reason: 'signal' },
          blocked_reason: null,
          buy_gate: { block_reason: 'sideways_pending' },
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['my_strat'],
      });
      const details = result?.sections.details ?? [];
      const names = details.map((d) => d.name);
      expect(names).toContain('my strat buy gate');
    });

    it('skips detail for a strategy whose signal is null', () => {
      const strategies = {
        no_signal: makeStrategyPoint({ signal: null }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['no_signal'],
      });
      expect(result?.sections.details).toHaveLength(0);
    });

    it('skips buy-gate detail when buy_gate.block_reason is null (non-string)', () => {
      // Exercises the `typeof blockReason === "string"` false branch in getBuyGateBlockReason:
      // plugin exists and is an object, but block_reason is null → returns null → no buy-gate detail
      const strategies = {
        my_strat: makeStrategyPoint({
          signal: { id: 'dma_gated_fgi' },
          decision: { action: 'hold', reason: 'waiting' },
          blocked_reason: null,
          buy_gate: { block_reason: null },
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['my_strat'],
      });
      const names = (result?.sections.details ?? []).map((d) => d.name);
      expect(names).not.toContain('my strat buy gate');
      expect(names).toContain('my strat decision');
    });
  });

  // ------------------------------------------------------------------
  // BTC / DMA 200 ratio computation
  // ------------------------------------------------------------------

  describe('BTC / DMA 200 ratio signal', () => {
    it('appends BTC/DMA200 ratio when both signals have numeric values', () => {
      const result = buildBacktestTooltipData({
        payload: createTooltipPayload(),
        label: '2026-01-01',
      });
      const ratio = result?.sections.signals.find(
        (s) => s.name === 'BTC / DMA 200',
      );
      expect(ratio).toBeDefined();
      expect(ratio?.value).toBe('1.20');
      expect(ratio?.color).toBe('#a78bfa');
    });

    it('does not append ratio when BTC Price signal is missing', () => {
      const payload = [
        {
          name: 'DMA 200',
          value: 50000,
          color: '#38bdf8',
          payload: {
            market: makeMarket(),
            strategies: {},
            eventStrategies: {},
          },
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      const ratio = result?.sections.signals.find(
        (s) => s.name === 'BTC / DMA 200',
      );
      expect(ratio).toBeUndefined();
    });

    it('does not append ratio when DMA 200 signal is missing', () => {
      const payload = [
        {
          name: 'BTC Price',
          value: 60000,
          color: '#22c55e',
          payload: {
            market: makeMarket(),
            strategies: {},
            eventStrategies: {},
          },
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      const ratio = result?.sections.signals.find(
        (s) => s.name === 'BTC / DMA 200',
      );
      expect(ratio).toBeUndefined();
    });

    it('does not append ratio when DMA 200 value is zero (avoids division by zero)', () => {
      const payload = [
        {
          name: 'BTC Price',
          value: 60000,
          color: '#22c55e',
          payload: {
            market: makeMarket(),
            strategies: {},
            eventStrategies: {},
          },
        },
        {
          name: 'DMA 200',
          value: 0,
          color: '#38bdf8',
          payload: {},
        },
      ];
      const result = buildBacktestTooltipData({ payload });
      const ratio = result?.sections.signals.find(
        (s) => s.name === 'BTC / DMA 200',
      );
      expect(ratio).toBeUndefined();
    });

    it("appends ratio of 0.00 when BTC Price value is undefined (formatSignalValue yields '', parsed as 0)", () => {
      // When BTC Price has no numeric value, formatSignalValue returns "".
      // parseNumericSignal("") → Number("") = 0 (finite), so btcNum = 0.
      // The ratio is computed as 0 / dmaNum = 0.00 and IS appended.
      const payload = [
        {
          name: 'BTC Price',
          value: undefined,
          color: '#22c55e',
          payload: {
            market: makeMarket(),
            strategies: {},
            eventStrategies: {},
          },
        },
        {
          name: 'DMA 200',
          value: 50000,
          color: '#38bdf8',
          payload: {},
        },
      ] as unknown as {
        name: string;
        value: number;
        color: string;
        payload: object;
      }[];
      const result = buildBacktestTooltipData({ payload });
      const ratio = result?.sections.signals.find(
        (s) => s.name === 'BTC / DMA 200',
      );
      // btcNum = 0 (parsed from ""), dmaNum = 50000 → ratio = "0.00"
      expect(ratio?.value).toBe('0.00');
    });
  });

  // ------------------------------------------------------------------
  // Full integration — categorizes all item types correctly
  // ------------------------------------------------------------------

  describe('full integration — categorizes strategies, signals, events, allocations', () => {
    it('produces correct sections from a complete payload', () => {
      const result = buildBacktestTooltipData({
        payload: createTooltipPayload(),
        label: '2026-01-01',
        sortedStrategyIds: ['dca_classic', 'dma_gated_fgi_default'],
      });

      expect(result?.sections.strategies).toEqual([
        { name: 'DMA Gated FGI Default', value: 12000, color: '#3b82f6' },
      ]);
      expect(result?.sections.signals).toEqual(
        expect.arrayContaining([
          { name: 'Sentiment', value: 'Fear (25)', color: '#f59e0b' },
          { name: 'BTC Price', value: '$60,000', color: '#22c55e' },
          { name: 'DMA 200', value: '$50,000', color: '#38bdf8' },
          { name: 'BTC / DMA 200', value: '1.20', color: '#a78bfa' },
        ]),
      );
      expect(result?.sections.events).toEqual([
        {
          name: 'Buy Spot',
          strategies: ['DMA Gated FGI Default'],
          color: '#22c55e',
        },
      ]);
      expect(result?.sections.allocations.map((a) => a.id)).toEqual([
        'dca_classic',
        'dma_gated_fgi_default',
      ]);
    });

    it('includes decision, blocked, and buy-gate details for strategies with signals', () => {
      const result = buildBacktestTooltipData({
        payload: createTooltipPayload(),
        label: '2026-01-01',
        sortedStrategyIds: ['dca_classic', 'dma_gated_fgi_default'],
      });

      expect(result?.sections.details).toEqual(
        expect.arrayContaining([
          {
            name: 'DMA Gated FGI Default decision',
            value: 'buy · below_extreme_fear_buy',
            color: '#cbd5e1',
          },
          {
            name: 'DMA Gated FGI Default blocked',
            value: 'cooldown_active',
            color: '#fda4af',
          },
          {
            name: 'DMA Gated FGI Default spot asset',
            value: 'ETH',
            color: '#627EEA',
          },
          {
            name: 'DMA Gated FGI Default buy gate',
            value: 'sideways_pending',
            color: '#fcd34d',
          },
        ]),
      );
    });
  });
});
