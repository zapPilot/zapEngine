import { describe, expect, it } from 'vitest';

import {
  buildChartPoint,
  calculateActualDays,
  calculateYAxisDomain,
  CHART_SIGNALS,
  filterToActiveStrategies,
  getPrimaryStrategyId,
  sentimentLabelToIndex,
  sortStrategyIds,
} from '@/components/wallet/portfolio/views/backtesting/utils/chartHelpers';
import { getBacktestSpotAssetColor } from '@/components/wallet/portfolio/views/backtesting/utils/spotAssetDisplay';
import type {
  BacktestAssetAllocation,
  BacktestStrategyPoint,
  BacktestTimelinePoint,
} from '@/types/backtesting';

function allocation(
  btc: number,
  stable: number,
  overrides: Partial<BacktestAssetAllocation> = {},
): BacktestAssetAllocation {
  return { btc, eth: 0, spy: 0, stable, alt: 0, ...overrides };
}

function createStrategyPoint(
  overrides: Partial<BacktestStrategyPoint> = {},
): BacktestStrategyPoint {
  return {
    portfolio: {
      spot_usd: 5000,
      stable_usd: 5000,
      total_value: 10000,
      allocation: allocation(0.5, 0.5),
    },
    signal: null,
    decision: {
      action: 'hold',
      reason: 'wait',
      rule_group: 'none',
      target_allocation: allocation(0.5, 0.5),
      immediate: false,
    },
    execution: {
      event: null,
      transfers: [],
      blocked_reason: null,
      step_count: 0,
      steps_remaining: 0,
      interval_days: 0,
    },
    ...overrides,
  };
}

function createTimelinePoint(
  overrides: Partial<BacktestTimelinePoint> = {},
): BacktestTimelinePoint {
  return {
    market: {
      date: '2024-01-01',
      token_price: { btc: 50000 },
      sentiment: null,
      sentiment_label: null,
    },
    strategies: {},
    ...overrides,
  };
}

describe('sentimentLabelToIndex', () => {
  it.each([
    ['extreme_fear', 0],
    ['fear', 25],
    ['neutral', 50],
    ['greed', 75],
    ['extreme_greed', 100],
  ])('maps %s to %i', (label, expected) => {
    expect(sentimentLabelToIndex(label)).toBe(expected);
  });

  it('returns null for unknown labels', () => {
    expect(sentimentLabelToIndex('unknown')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(sentimentLabelToIndex(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(sentimentLabelToIndex(undefined)).toBeNull();
  });
});

describe('getPrimaryStrategyId', () => {
  it('returns null for an empty array', () => {
    expect(getPrimaryStrategyId([])).toBeNull();
  });

  it('prefers the first non-DCA strategy', () => {
    expect(getPrimaryStrategyId(['dca_classic', 'dma_gated_fgi_default'])).toBe(
      'dma_gated_fgi_default',
    );
  });

  it('falls back to sortedIds[0] when all ids are dca_classic', () => {
    // Exercises the `?? sortedIds[0]` branch: find() returns undefined
    // because every id equals DCA_CLASSIC_STRATEGY_ID
    expect(getPrimaryStrategyId(['dca_classic'])).toBe('dca_classic');
  });
});

describe('CHART_SIGNALS', () => {
  it('uses shared portfolio chart colors for ETH/BTC switch markers', () => {
    expect(
      CHART_SIGNALS.find((signal) => signal.key === 'switch_to_eth')?.color,
    ).toBe(getBacktestSpotAssetColor('ETH'));
    expect(
      CHART_SIGNALS.find((signal) => signal.key === 'switch_to_btc')?.color,
    ).toBe(getBacktestSpotAssetColor('BTC'));
  });
});

describe('sortStrategyIds', () => {
  it('places dca_classic first', () => {
    expect(sortStrategyIds(['dma_gated_fgi_default', 'dca_classic'])).toEqual([
      'dca_classic',
      'dma_gated_fgi_default',
    ]);
  });

  it('sorts other strategies by display name', () => {
    expect(sortStrategyIds(['zebra_strategy', 'alpha_strategy'])).toEqual([
      'alpha_strategy',
      'zebra_strategy',
    ]);
  });
});

describe('calculateActualDays', () => {
  it('returns 0 for fewer than two points', () => {
    expect(calculateActualDays([])).toBe(0);
    expect(calculateActualDays([createTimelinePoint()])).toBe(0);
  });

  it('calculates span from market.date', () => {
    const timeline = [
      createTimelinePoint({
        market: {
          date: '2024-01-01',
          token_price: { btc: 1 },
          sentiment: null,
          sentiment_label: null,
        },
      }),
      createTimelinePoint({
        market: {
          date: '2024-01-31',
          token_price: { btc: 1 },
          sentiment: null,
          sentiment_label: null,
        },
      }),
    ];

    expect(calculateActualDays(timeline)).toBe(31);
  });
});

describe('calculateYAxisDomain', () => {
  it('returns the default domain when there is no data', () => {
    expect(calculateYAxisDomain([], [])).toEqual([0, 1000]);
  });

  it('returns default domain when all points have no numeric values', () => {
    const [min, max] = calculateYAxisDomain(
      [{ date: '2024-01-01' }, { date: '2024-01-02' }],
      ['nonexistent_strategy'],
    );

    expect(min).toBe(0);
    expect(max).toBe(1000);
  });

  it('includes strategy values and signal markers', () => {
    const [min, max] = calculateYAxisDomain(
      [
        { dma_gated_fgi_default_value: 1000, buySpotSignal: 500 },
        { dma_gated_fgi_default_value: 2000, sellSpotSignal: 2200 },
      ],
      ['dma_gated_fgi_default'],
    );

    expect(min).toBe(415);
    expect(max).toBe(2285);
  });
});

describe('buildChartPoint', () => {
  it('copies strategy values from portfolio.total_value', () => {
    const point = createTimelinePoint({
      strategies: {
        dma_gated_fgi_default: createStrategyPoint({
          portfolio: {
            spot_usd: 8000,
            stable_usd: 2000,
            total_value: 12000,
            allocation: allocation(0.8, 0.2),
          },
        }),
        dca_classic: createStrategyPoint({
          portfolio: {
            spot_usd: 5250,
            stable_usd: 5250,
            total_value: 10500,
            allocation: allocation(0.5, 0.5),
          },
        }),
      },
    });

    const result = buildChartPoint(point, [
      'dma_gated_fgi_default',
      'dca_classic',
    ]);

    expect(result.dma_gated_fgi_default_value).toBe(12000);
    expect(result.dca_classic_value).toBe(10500);
    expect(result.market).toEqual(point.market);
    expect(result.strategies).toEqual(point.strategies);
  });

  it('uses market.sentiment when present', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        market: {
          date: '2024-01-01',
          token_price: { btc: 50000 },
          sentiment: 18,
          sentiment_label: 'extreme_fear',
        },
      }),
      [],
    );

    expect(result.sentiment).toBe(18);
  });

  it('copies macro fear and greed score from the market snapshot', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        market: {
          date: '2024-01-01',
          token_price: { btc: 50000 },
          sentiment: null,
          sentiment_label: null,
          macro_fear_greed: {
            score: 35,
            label: 'fear',
            source: 'cnn_fear_greed_unofficial',
            updated_at: '2024-01-01T12:00:00+00:00',
            raw_rating: 'Fear',
          },
        },
      }),
      [],
    );

    expect(result.macro_fear_greed).toBe(35);
  });

  it('falls back to a sentiment label index', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        market: {
          date: '2024-01-01',
          token_price: { btc: 50000 },
          sentiment: null,
          sentiment_label: 'fear',
        },
      }),
      [],
    );

    expect(result.sentiment).toBe(25);
  });

  it('reads dma_200 from the first strategy signal with DMA data', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          dma_gated_fgi_default: createStrategyPoint({
            signal: {
              id: 'dma_gated_fgi',
              regime: 'fear',
              raw_value: 20,
              confidence: 1,
              details: {
                dma: {
                  dma_200: 48000,
                  distance: 0,
                  zone: 'above',
                  cross_event: null,
                  cooldown_active: false,
                  cooldown_remaining_days: 0,
                  cooldown_blocked_zone: null,
                  fgi_slope: 0,
                },
              },
            },
          }),
        },
      }),
      ['dma_gated_fgi_default'],
    );

    expect(result.dma_200).toBe(48000);
  });

  it('creates a sell spot marker from a spot -> stable transfer', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          dma_gated_fgi_default: createStrategyPoint({
            execution: {
              event: 'rebalance',
              transfers: [
                {
                  from_bucket: 'spot',
                  to_bucket: 'stable',
                  amount_usd: 100,
                },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
        },
      }),
      ['dma_gated_fgi_default'],
    );

    expect(result.sellSpotSignal).toBe(10000);
    expect(
      (result.eventStrategies as Record<string, string[]>).sell_spot,
    ).toEqual(['DMA Gated FGI Default']);
  });

  it('creates a buy spot marker from a stable -> spot transfer', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          dma_gated_fgi_default: createStrategyPoint({
            portfolio: {
              spot_usd: 7000,
              stable_usd: 3000,
              total_value: 11000,
              allocation: allocation(0.7, 0.3),
            },
            execution: {
              event: 'rebalance',
              transfers: [
                {
                  from_bucket: 'stable',
                  to_bucket: 'spot',
                  amount_usd: 200,
                },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
        },
      }),
      ['dma_gated_fgi_default'],
    );

    expect(result.buySpotSignal).toBe(11000);
  });

  it('ignores DCA transfers when computing markers', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          dca_classic: createStrategyPoint({
            execution: {
              event: 'buy',
              transfers: [
                {
                  from_bucket: 'stable',
                  to_bucket: 'spot',
                  amount_usd: 100,
                },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 7,
            },
          }),
        },
      }),
      ['dca_classic'],
    );

    expect(result.buySpotSignal).toBeNull();
    expect(result.sellSpotSignal).toBeNull();
  });

  it('skips missing strategy ids in strategies map', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          existing_strat: createStrategyPoint(),
        },
      }),
      ['existing_strat', 'nonexistent_strat'],
    );

    expect(result.existing_strat_value).toBe(10000);
    expect(result.nonexistent_strat_value).toBeUndefined();
  });

  it('returns null sentiment when both sentiment and label are null', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        market: {
          date: '2024-01-01',
          token_price: { btc: 50000 },
          sentiment: null,
          sentiment_label: null,
        },
      }),
      [],
    );

    expect(result.sentiment).toBeNull();
  });

  it('returns null macro fear and greed when the market snapshot omits it', () => {
    const result = buildChartPoint(createTimelinePoint(), []);

    expect(result.macro_fear_greed).toBeNull();
  });

  it('returns null dma_200 when no strategies have DMA data', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          strat_a: createStrategyPoint({ signal: null }),
        },
      }),
      ['strat_a'],
    );

    expect(result.dma_200).toBeNull();
  });

  it('uses null for transfers when execution.transfers is null or undefined', () => {
    // Exercises the `strategy.execution.transfers ?? []` fallback in getTransfers
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          dma_gated_fgi_default: createStrategyPoint({
            execution: {
              event: 'rebalance',
              transfers: null as unknown as [],
              blocked_reason: null,
              step_count: 0,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
        },
      }),
      ['dma_gated_fgi_default'],
    );

    // No transfers processed — signals remain null
    expect(result.buySpotSignal).toBeNull();
    expect(result.sellSpotSignal).toBeNull();
  });

  it('skips transfers with neither stable->spot nor spot->stable direction', () => {
    // Exercises the `if (!signalKey) continue` branch in processStrategyTransfers
    // and the `return null` branch of classifyTransfer
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          dma_gated_fgi_default: createStrategyPoint({
            execution: {
              event: 'rebalance',
              transfers: [
                {
                  from_bucket: 'spot',
                  to_bucket: 'spot', // unrecognised direction
                  amount_usd: 100,
                },
                {
                  from_bucket: 'stable',
                  to_bucket: 'stable', // also unrecognised
                  amount_usd: 50,
                },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
        },
      }),
      ['dma_gated_fgi_default'],
    );

    // Unrecognised transfer directions produce no signal markers
    expect(result.buySpotSignal).toBeNull();
    expect(result.sellSpotSignal).toBeNull();
  });

  it('does not add duplicate strategy name when same strategy triggers the same signal twice', () => {
    // Exercises the `if (!strategies.includes(displayName))` false branch in updateSignal
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          dma_gated_fgi_default: createStrategyPoint({
            portfolio: {
              spot_usd: 7000,
              stable_usd: 3000,
              total_value: 11000,
              allocation: allocation(0.7, 0.3),
            },
            execution: {
              event: 'rebalance',
              transfers: [
                { from_bucket: 'stable', to_bucket: 'spot', amount_usd: 100 },
                { from_bucket: 'stable', to_bucket: 'spot', amount_usd: 50 },
              ],
              blocked_reason: null,
              step_count: 2,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
        },
      }),
      ['dma_gated_fgi_default'],
    );

    const eventStrategies = result.eventStrategies as Record<string, string[]>;
    // Strategy name should appear only once despite two matching transfers
    expect(eventStrategies.buy_spot).toEqual(['DMA Gated FGI Default']);
  });

  it('returns null btc_price when token_price has no btc key', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        market: {
          date: '2024-01-01',
          token_price: {},
          sentiment: null,
          sentiment_label: null,
        },
      }),
      [],
    );

    expect(result.btc_price).toBeNull();
  });

  it('uses the max portfolio value when multiple strategies trigger the same marker', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          dma_gated_fgi_default: createStrategyPoint({
            portfolio: {
              spot_usd: 7000,
              stable_usd: 3000,
              total_value: 11000,
              allocation: allocation(0.7, 0.3),
            },
            execution: {
              event: 'rebalance',
              transfers: [
                {
                  from_bucket: 'stable',
                  to_bucket: 'spot',
                  amount_usd: 100,
                },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
          alpha_strategy: createStrategyPoint({
            portfolio: {
              spot_usd: 10000,
              stable_usd: 5000,
              total_value: 15000,
              allocation: allocation(2 / 3, 1 / 3),
            },
            execution: {
              event: 'rebalance',
              transfers: [
                {
                  from_bucket: 'stable',
                  to_bucket: 'spot',
                  amount_usd: 200,
                },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
        },
      }),
      ['dma_gated_fgi_default', 'alpha_strategy'],
    );

    expect(result.buySpotSignal).toBe(15000);
  });

  it('does not synthesize switch markers from portfolio spot asset metadata', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          dma_gated_fgi_default: createStrategyPoint({
            portfolio: {
              spot_usd: 5000,
              stable_usd: 5000,
              total_value: 10000,
              spot_asset: 'BTC',
              allocation: allocation(0.5, 0.5),
            },
            decision: {
              action: 'hold',
              reason: 'initial',
              rule_group: 'none',
              target_allocation: allocation(0.8, 0.2),
              immediate: false,
              details: {
                target_spot_asset: 'BTC',
              },
            },
          }),
        },
      }),
      ['dma_gated_fgi_default'],
    );

    expect(result.switchToBtcSignal).toBeNull();
    expect(result.switchToEthSignal).toBeNull();
    expect(
      (result.eventStrategies as Record<string, string[]>).switch_to_btc,
    ).toEqual([]);
    expect(
      (result.eventStrategies as Record<string, string[]>).switch_to_eth,
    ).toEqual([]);
  });

  it('creates a buy spot marker from a stable → eth transfer', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          eth_btc_rotation_default: createStrategyPoint({
            portfolio: {
              spot_usd: 7000,
              stable_usd: 3000,
              total_value: 11000,
              allocation: allocation(0.7, 0.3),
            },
            execution: {
              event: 'rebalance',
              transfers: [
                { from_bucket: 'stable', to_bucket: 'eth', amount_usd: 200 },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
        },
      }),
      ['eth_btc_rotation_default'],
    );

    expect(result.buySpotSignal).toBe(11000);
    expect(result.sellSpotSignal).toBeNull();
  });

  it('creates a buy spot marker from a stable → btc transfer', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          eth_btc_rotation_default: createStrategyPoint({
            portfolio: {
              spot_usd: 7000,
              stable_usd: 3000,
              total_value: 11000,
              allocation: allocation(0.7, 0.3),
            },
            execution: {
              event: 'rebalance',
              transfers: [
                { from_bucket: 'stable', to_bucket: 'btc', amount_usd: 200 },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
        },
      }),
      ['eth_btc_rotation_default'],
    );

    expect(result.buySpotSignal).toBe(11000);
  });

  it('creates a sell spot marker from an eth → stable transfer', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          eth_btc_rotation_default: createStrategyPoint({
            execution: {
              event: 'rebalance',
              transfers: [
                { from_bucket: 'eth', to_bucket: 'stable', amount_usd: 100 },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
        },
      }),
      ['eth_btc_rotation_default'],
    );

    expect(result.sellSpotSignal).toBe(10000);
    expect(result.buySpotSignal).toBeNull();
  });

  it('creates a switchToBtc marker from an eth → btc transfer', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          eth_btc_rotation_default: createStrategyPoint({
            execution: {
              event: 'rebalance',
              transfers: [
                { from_bucket: 'eth', to_bucket: 'btc', amount_usd: 500 },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
        },
      }),
      ['eth_btc_rotation_default'],
    );

    expect(result.switchToBtcSignal).toBe(10000);
    expect(result.switchToEthSignal).toBeNull();
    expect(
      (result.eventStrategies as Record<string, string[]>).switch_to_btc,
    ).toEqual(['eth btc rotation default']);
  });

  it('creates a switchToEth marker from a btc → eth transfer', () => {
    const result = buildChartPoint(
      createTimelinePoint({
        strategies: {
          eth_btc_rotation_default: createStrategyPoint({
            execution: {
              event: 'rebalance',
              transfers: [
                { from_bucket: 'btc', to_bucket: 'eth', amount_usd: 500 },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 3,
            },
          }),
        },
      }),
      ['eth_btc_rotation_default'],
    );

    expect(result.switchToEthSignal).toBe(10000);
    expect(result.switchToBtcSignal).toBeNull();
  });

  it('does not emit signals from a second strategy excluded from strategyIds', () => {
    const point = createTimelinePoint({
      strategies: {
        dma_gated_fgi_default: createStrategyPoint({
          portfolio: {
            spot_usd: 7000,
            stable_usd: 3000,
            total_value: 11000,
            allocation: allocation(0.7, 0.3),
          },
          execution: {
            event: 'rebalance',
            transfers: [
              { from_bucket: 'stable', to_bucket: 'spot', amount_usd: 100 },
            ],
            blocked_reason: null,
            step_count: 1,
            steps_remaining: 0,
            interval_days: 3,
          },
        }),
        eth_btc_rotation_default: createStrategyPoint({
          portfolio: {
            spot_usd: 5000,
            stable_usd: 5000,
            total_value: 15000,
            allocation: allocation(0.5, 0.5),
          },
          execution: {
            event: 'rebalance',
            transfers: [
              { from_bucket: 'eth', to_bucket: 'stable', amount_usd: 300 },
            ],
            blocked_reason: null,
            step_count: 1,
            steps_remaining: 0,
            interval_days: 3,
          },
        }),
      },
    });

    // Only pass dma strategy — rotation signals must NOT bleed through
    const result = buildChartPoint(point, ['dma_gated_fgi_default']);

    expect(result.buySpotSignal).toBe(11000);
    // If rotation signals bled through, sellSpotSignal would be 15000
    expect(result.sellSpotSignal).toBeNull();
    expect(
      (result.eventStrategies as Record<string, string[]>).buy_spot,
    ).toEqual(['DMA Gated FGI Default']);
  });
});

describe('filterToActiveStrategies', () => {
  it('returns an empty array for empty input', () => {
    expect(filterToActiveStrategies([])).toEqual([]);
  });

  it('returns dca_classic and primary strategy from 3+ strategies', () => {
    expect(
      filterToActiveStrategies(['dca_classic', 'dma_gated_fgi', 'extra_strat']),
    ).toEqual(['dca_classic', 'dma_gated_fgi']);
  });

  it('returns only dca_classic when it is the sole strategy', () => {
    expect(filterToActiveStrategies(['dca_classic'])).toEqual(['dca_classic']);
  });

  it('returns the single non-DCA strategy when DCA is absent', () => {
    expect(filterToActiveStrategies(['other_strategy'])).toEqual([
      'other_strategy',
    ]);
  });
  it('returns at most 2 IDs', () => {
    const result = filterToActiveStrategies([
      'dca_classic',
      'alpha',
      'bravo',
      'charlie',
    ]);
    expect(result.length).toBeLessThanOrEqual(2);
    expect(result).toEqual(['dca_classic', 'alpha']);
  });
});
