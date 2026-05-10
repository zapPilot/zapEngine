import { describe, expect, it, vi } from 'vitest';

import { buildBacktestTooltipData } from '@/components/wallet/portfolio/views/backtesting/utils/backtestTooltipDataUtils';
import type {
  BacktestBucket,
  BacktestTransferMetadata,
} from '@/types/backtesting';

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
    action: 'buy' | 'sell' | 'hold';
    reason: string;
    rule_group?: 'cross' | 'cooldown' | 'dma_fgi' | 'ath' | 'rotation' | 'none';
    immediate?: boolean;
    details?: { allocation_name?: string | null; target_spot_asset?: unknown };
  };
  transfers?: BacktestTransferMetadata[];
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
        : { id: 'eth_btc_rs_signal' },
    decision: {
      action: overrides.decision?.action ?? 'hold',
      reason: overrides.decision?.reason ?? 'baseline',
      rule_group: overrides.decision?.rule_group ?? 'none',
      target_allocation: {
        ...defaultAllocation,
        ...overrides.allocation,
      },
      immediate: overrides.decision?.immediate ?? false,
      ...(overrides.decision?.details !== undefined && {
        details: overrides.decision.details,
      }),
    },
    execution: {
      event: null,
      transfers: overrides.transfers ?? [],
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

function transfer(
  from_bucket: BacktestBucket,
  to_bucket: BacktestBucket,
  amount_usd: number,
): BacktestTransferMetadata {
  return { from_bucket, to_bucket, amount_usd };
}

// Full payload used across multiple tests (mirrors original fixture)
function createTooltipPayload() {
  return [
    {
      name: 'ETH/BTC Rotation Default',
      value: 12000,
      color: '#3b82f6',
      payload: {
        market: makeMarket(),
        eventStrategies: {
          buy_spot: ['ETH/BTC Rotation Default'],
          sell_spot: [],
        },
        strategies: {
          dma_fgi_portfolio_rules: makeStrategyPoint({
            spot: 5000,
            stable: 5000,
            signal: null,
          }),
          eth_btc_rotation_default: makeStrategyPoint({
            spot: 9600,
            stable: 2400,
            spotAsset: 'ETH',
            signal: { id: 'eth_btc_rs_signal' },
            decision: {
              action: 'buy',
              reason: 'below_extreme_fear_buy',
              rule_group: 'dma_fgi',
              details: {
                allocation_name: 'dma_below_extreme_fear_buy',
                target_spot_asset: 'ETH',
              },
            },
            transfers: [transfer('stable', 'eth', 240)],
            blocked_reason: 'cooldown_active',
            buy_gate: { block_reason: 'sideways_pending' },
          }),
        },
      },
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

    it('shows no asset changes for stable-only hold points without transfers', () => {
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

      expect(result?.sections.decision?.assetChanges).toEqual([]);
      expect(result?.sections.decision?.assetChangeNote?.label).toBe(
        'No asset changes - held position',
      );
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
  // Decision summary
  // ------------------------------------------------------------------

  describe('decision summary', () => {
    it('uses the active primary comparison strategy only', () => {
      const strategies = {
        dma_fgi_portfolio_rules: makeStrategyPoint({
          signal: { id: 'eth_btc_rs_signal' },
          decision: {
            action: 'buy',
            reason: 'daily_buy',
            rule_group: 'none',
          },
          transfers: [transfer('stable', 'btc', 100)],
        }),
        primary_strategy: makeStrategyPoint({
          signal: { id: 'eth_btc_rs_signal' },
          decision: {
            action: 'buy',
            reason: 'below_extreme_fear_buy',
            rule_group: 'dma_fgi',
            details: {
              allocation_name: 'dma_below_extreme_fear_buy',
            },
          },
          transfers: [transfer('stable', 'eth', 200)],
        }),
        secondary_strategy: makeStrategyPoint({
          signal: { id: 'eth_btc_rs_signal' },
          decision: {
            action: 'sell',
            reason: 'above_greed_sell',
            rule_group: 'dma_fgi',
          },
          transfers: [transfer('btc', 'stable', 300)],
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['primary_strategy', 'secondary_strategy'],
      });

      expect(result?.sections.decision?.strategyId).toBe('primary_strategy');
      expect(result?.sections.decision?.displayName).toBe('primary strategy');
      expect(result?.sections.decision?.rule).toEqual({
        label: 'dma_below_extreme_fear_buy',
        group: 'dma_fgi',
      });
      expect(result?.sections.decision?.action.label).toBe('Buy');
      expect(result?.sections.decision?.assetChanges).toEqual([
        {
          label: 'Stable -> ETH',
          value: '$200',
          color: '#86efac',
        },
      ]);
    });

    it('falls back to the decision reason when allocation_name is missing', () => {
      const strategies = {
        my_strat: makeStrategyPoint({
          signal: { id: 'eth_btc_rs_signal' },
          decision: {
            action: 'hold',
            reason: 'regime_no_signal',
            rule_group: 'none',
          },
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['my_strat'],
      });

      expect(result?.sections.decision?.rule).toEqual({
        label: 'regime_no_signal',
        group: 'none',
      });
    });

    it('formats buy, sell, and rotation asset changes from transfers', () => {
      const strategies = {
        my_strat: makeStrategyPoint({
          signal: { id: 'eth_btc_rs_signal' },
          decision: {
            action: 'buy',
            reason: 'mixed_rebalance',
            rule_group: 'rotation',
          },
          transfers: [
            transfer('stable', 'eth', 200),
            transfer('btc', 'stable', 150),
            transfer('btc', 'eth', 125),
          ],
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['my_strat'],
      });

      expect(result?.sections.decision?.assetChanges).toEqual([
        { label: 'Stable -> ETH', value: '$200', color: '#86efac' },
        { label: 'BTC -> Stable', value: '$150', color: '#fca5a5' },
        { label: 'BTC -> ETH', value: '$125', color: '#c4b5fd' },
      ]);
    });

    it('uses a blocked no-change note when there are no transfers', () => {
      const strategies = {
        my_strat: makeStrategyPoint({
          signal: { id: 'eth_btc_rs_signal' },
          decision: {
            action: 'buy',
            reason: 'below_extreme_fear_buy',
            rule_group: 'dma_fgi',
          },
          blocked_reason: 'cooldown_active',
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['my_strat'],
      });

      expect(result?.sections.decision?.assetChanges).toEqual([]);
      expect(result?.sections.decision?.assetChangeNote).toEqual({
        label: 'No asset changes - blocked by cooldown_active',
        color: '#fda4af',
      });
    });

    it('uses a held-position no-change note when there are no transfers and no block', () => {
      const strategies = {
        my_strat: makeStrategyPoint({
          signal: { id: 'eth_btc_rs_signal' },
          decision: {
            action: 'hold',
            reason: 'waiting',
            rule_group: 'none',
          },
        }),
      };
      const result = buildBacktestTooltipData({
        payload: minimalPayload(makeMarket(), strategies),
        sortedStrategyIds: ['my_strat'],
      });

      expect(result?.sections.decision?.assetChanges).toEqual([]);
      expect(result?.sections.decision?.assetChangeNote).toEqual({
        label: 'No asset changes - held position',
        color: '#cbd5e1',
      });
    });
  });

  // ------------------------------------------------------------------
  // Full integration — categorizes strategy, event, decision, and allocations
  // ------------------------------------------------------------------

  describe('full integration — categorizes strategies, events, allocations', () => {
    it('produces correct sections from a complete payload', () => {
      const result = buildBacktestTooltipData({
        payload: createTooltipPayload(),
        label: '2026-01-01',
        sortedStrategyIds: [
          'eth_btc_rotation_default',
          'dma_fgi_portfolio_rules',
        ],
      });

      expect(result?.sections.strategies).toEqual([
        { name: 'ETH/BTC Rotation Default', value: 12000, color: '#3b82f6' },
      ]);
      expect(result?.sections).not.toHaveProperty('signals');
      expect(result?.sections.events).toEqual([
        {
          name: 'Buy Spot',
          strategies: ['ETH/BTC Rotation Default'],
          color: '#22c55e',
        },
      ]);
      expect(result?.sections.allocations.map((a) => a.id)).toEqual([
        'eth_btc_rotation_default',
        'dma_fgi_portfolio_rules',
      ]);
    });

    it('includes the active comparison decision summary', () => {
      const result = buildBacktestTooltipData({
        payload: createTooltipPayload(),
        label: '2026-01-01',
        sortedStrategyIds: [
          'eth_btc_rotation_default',
          'dma_fgi_portfolio_rules',
        ],
      });

      expect(result?.sections.decision).toEqual({
        strategyId: 'eth_btc_rotation_default',
        displayName: 'ETH/BTC Rotation Default',
        rule: {
          label: 'dma_below_extreme_fear_buy',
          group: 'dma_fgi',
        },
        action: {
          label: 'Buy',
          color: '#86efac',
        },
        assetChanges: [
          {
            label: 'Stable -> ETH',
            value: '$240',
            color: '#86efac',
          },
        ],
        assetChangeNote: null,
      });
    });
  });
});
