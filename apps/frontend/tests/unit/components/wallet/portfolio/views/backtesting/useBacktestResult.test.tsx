import { describe, expect, it } from 'vitest';

import { useBacktestResult } from '@/components/wallet/portfolio/views/backtesting/hooks/useBacktestResult';

import { renderHook } from '../../../../../../test-utils';

function createResponse() {
  return {
    strategies: {
      dca_classic: {
        strategy_id: 'dca_classic',
        display_name: 'DCA Classic',
        total_invested: 10000,
        final_value: 10000,
        roi_percent: 0,
        trade_count: 0,
        final_allocation: {
          btc: 0.5,
          eth: 0,
          spy: 0,
          stable: 0.5,
          alt: 0,
        },
        parameters: {},
      },
      dma_gated_fgi_default: {
        strategy_id: 'dma_gated_fgi',
        display_name: 'DMA Gated FGI Default',
        signal_id: 'dma_gated_fgi' as const,
        total_invested: 10000,
        final_value: 10500,
        roi_percent: 5,
        trade_count: 1,
        final_allocation: {
          btc: 0.8,
          eth: 0,
          spy: 0,
          stable: 0.2,
          alt: 0,
        },
        parameters: {},
      },
    },
    timeline: [
      {
        market: {
          date: '2024-01-01',
          token_price: { btc: 50000 },
          sentiment: 50,
          sentiment_label: 'neutral',
        },
        strategies: {
          dca_classic: {
            portfolio: {
              spot_usd: 5000,
              stable_usd: 5000,
              total_value: 10000,
              spot_asset: 'BTC',
              allocation: {
                btc: 0.5,
                eth: 0,
                spy: 0,
                stable: 0.5,
                alt: 0,
              },
            },
            signal: null,
            decision: {
              action: 'hold' as const,
              reason: 'baseline_dca',
              rule_group: 'none' as const,
              target_allocation: {
                btc: 0.5,
                eth: 0,
                spy: 0,
                stable: 0.5,
                alt: 0,
              },
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
          },
          dma_gated_fgi_default: {
            portfolio: {
              spot_usd: 5000,
              stable_usd: 5000,
              total_value: 10000,
              spot_asset: 'BTC',
              allocation: {
                btc: 0.5,
                eth: 0,
                spy: 0,
                stable: 0.5,
                alt: 0,
              },
            },
            signal: {
              id: 'dma_gated_fgi' as const,
              regime: 'fear',
              raw_value: 20,
              confidence: 1,
              details: {
                dma: {
                  dma_200: 49500,
                  distance: 0.01,
                  zone: 'above' as const,
                  cross_event: null,
                  cooldown_active: false,
                  cooldown_remaining_days: 0,
                  cooldown_blocked_zone: null,
                  fgi_slope: 1,
                },
              },
            },
            decision: {
              action: 'sell' as const,
              reason: 'take_profit',
              rule_group: 'dma_fgi' as const,
              target_allocation: {
                btc: 0.4,
                eth: 0,
                spy: 0,
                stable: 0.6,
                alt: 0,
              },
              immediate: false,
            },
            execution: {
              event: 'rebalance',
              transfers: [
                {
                  from_bucket: 'spot' as const,
                  to_bucket: 'stable' as const,
                  amount_usd: 123,
                },
              ],
              blocked_reason: null,
              step_count: 1,
              steps_remaining: 0,
              interval_days: 3,
            },
          },
        },
      },
      {
        market: {
          date: '2024-01-31',
          token_price: { btc: 51000 },
          sentiment: 55,
          sentiment_label: 'greed',
        },
        strategies: {
          dca_classic: {
            portfolio: {
              spot_usd: 5100,
              stable_usd: 5100,
              total_value: 10200,
              spot_asset: 'BTC',
              allocation: {
                btc: 0.5,
                eth: 0,
                spy: 0,
                stable: 0.5,
                alt: 0,
              },
            },
            signal: null,
            decision: {
              action: 'hold' as const,
              reason: 'baseline_dca',
              rule_group: 'none' as const,
              target_allocation: {
                btc: 0.5,
                eth: 0,
                spy: 0,
                stable: 0.5,
                alt: 0,
              },
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
          },
          dma_gated_fgi_default: {
            portfolio: {
              spot_usd: 8400,
              stable_usd: 2100,
              total_value: 10500,
              spot_asset: 'BTC',
              allocation: {
                btc: 0.8,
                eth: 0,
                spy: 0,
                stable: 0.2,
                alt: 0,
              },
            },
            signal: {
              id: 'dma_gated_fgi' as const,
              regime: 'greed',
              raw_value: 75,
              confidence: 1,
              details: {
                dma: {
                  dma_200: 50000,
                  distance: 0.02,
                  zone: 'above' as const,
                  cross_event: null,
                  cooldown_active: false,
                  cooldown_remaining_days: 0,
                  cooldown_blocked_zone: null,
                  fgi_slope: 1,
                },
              },
            },
            decision: {
              action: 'hold' as const,
              reason: 'wait',
              rule_group: 'none' as const,
              target_allocation: {
                btc: 0.8,
                eth: 0,
                spy: 0,
                stable: 0.2,
                alt: 0,
              },
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
          },
        },
      },
    ],
  };
}

describe('useBacktestResult', () => {
  it('returns empty defaults for null response', () => {
    const { result } = renderHook(() => useBacktestResult(null));

    expect(result.current).toEqual({
      chartData: [],
      yAxisDomain: [0, 1000],
      summary: null,
      sortedStrategyIds: [],
      actualDays: 0,
    });
  });

  it('builds chart markers from execution transfers', () => {
    const { result } = renderHook(() =>
      useBacktestResult(createResponse() as any),
    );

    const point = result.current.chartData[0] as any;

    expect(point.sellSpotSignal).toBe(10000);
    expect(point.buySpotSignal).toBeNull();
    expect(point.dma_200).toBe(49500);
    expect(point.eventStrategies.sell_spot).toContain('DMA Gated FGI Default');
  });

  it('wraps strategies in a summary object', () => {
    const response = createResponse();
    const { result } = renderHook(() => useBacktestResult(response as any));

    expect(result.current.summary).toEqual({ strategies: response.strategies });
  });

  it('sorts DCA first and keeps the DMA config in the list', () => {
    const { result } = renderHook(() =>
      useBacktestResult(createResponse() as any),
    );

    expect(result.current.sortedStrategyIds[0]).toBe('dca_classic');
    expect(result.current.sortedStrategyIds).toContain('dma_gated_fgi_default');
  });

  it('derives actual days from market.date', () => {
    const { result } = renderHook(() =>
      useBacktestResult(createResponse() as any),
    );

    expect(result.current.actualDays).toBe(31);
  });

  it('keeps chartData length aligned with the timeline length', () => {
    const { result } = renderHook(() =>
      useBacktestResult(createResponse() as any),
    );

    expect(result.current.chartData).toHaveLength(2);
  });

  it('preserves portfolio.spot_asset on chartData strategies for tooltip consumers', () => {
    const { result } = renderHook(() =>
      useBacktestResult(createResponse() as any),
    );

    const point = result.current.chartData[0] as any;
    expect(point.strategies.dma_gated_fgi_default.portfolio.spot_asset).toBe(
      'BTC',
    );
  });

  it('returns a valid y-axis domain tuple', () => {
    const { result } = renderHook(() =>
      useBacktestResult(createResponse() as any),
    );
    const [min, max] = result.current.yAxisDomain;

    expect(typeof min).toBe('number');
    expect(typeof max).toBe('number');
    expect(min).toBeLessThanOrEqual(max);
  });

  it('does not synthesize switch markers from spot asset metadata changes', () => {
    const response = {
      strategies: {
        eth_btc_rotation_default: {
          strategy_id: 'eth_btc_rotation',
          display_name: 'ETH BTC Rotation Default',
          signal_id: 'eth_btc_rs_signal',
          total_invested: 10000,
          final_value: 10400,
          roi_percent: 4,
          trade_count: 2,
          final_allocation: {
            btc: 0.8,
            eth: 0,
            spy: 0,
            stable: 0.2,
            alt: 0,
          },
          parameters: {},
        },
      },
      timeline: [
        {
          market: {
            date: '2024-01-01',
            token_price: { btc: 50000 },
            sentiment: 40,
            sentiment_label: 'fear',
          },
          strategies: {
            eth_btc_rotation_default: {
              portfolio: {
                spot_usd: 8000,
                stable_usd: 2000,
                total_value: 10000,
                spot_asset: 'BTC',
                allocation: { btc: 0.8, eth: 0, spy: 0, stable: 0.2, alt: 0 },
              },
              signal: { id: 'eth_btc_rs_signal' },
              decision: {
                action: 'hold',
                reason: 'btc',
                rule_group: 'none',
                target_allocation: {
                  btc: 0.8,
                  eth: 0,
                  spy: 0,
                  stable: 0.2,
                  alt: 0,
                },
                immediate: false,
                details: { target_spot_asset: 'BTC' },
              },
              execution: {
                event: null,
                transfers: [],
                blocked_reason: null,
                step_count: 0,
                steps_remaining: 0,
                interval_days: 1,
              },
            },
          },
        },
        {
          market: {
            date: '2024-01-02',
            token_price: { btc: 50500 },
            sentiment: 42,
            sentiment_label: 'fear',
          },
          strategies: {
            eth_btc_rotation_default: {
              portfolio: {
                spot_usd: 8100,
                stable_usd: 2100,
                total_value: 10200,
                spot_asset: 'ETH',
                allocation: { btc: 0, eth: 0.8, spy: 0, stable: 0.2, alt: 0 },
              },
              signal: { id: 'eth_btc_rs_signal' },
              decision: {
                action: 'hold',
                reason: 'eth',
                rule_group: 'none',
                target_allocation: {
                  btc: 0,
                  eth: 0.8,
                  spy: 0,
                  stable: 0.2,
                  alt: 0,
                },
                immediate: false,
                details: { target_spot_asset: 'ETH' },
              },
              execution: {
                event: null,
                transfers: [],
                blocked_reason: null,
                step_count: 0,
                steps_remaining: 0,
                interval_days: 1,
              },
            },
          },
        },
        {
          market: {
            date: '2024-01-03',
            token_price: { btc: 51000 },
            sentiment: 45,
            sentiment_label: 'neutral',
          },
          strategies: {
            eth_btc_rotation_default: {
              portfolio: {
                spot_usd: 0,
                stable_usd: 10200,
                total_value: 10200,
                spot_asset: null,
                allocation: { btc: 0, eth: 0, spy: 0, stable: 1, alt: 0 },
              },
              signal: { id: 'eth_btc_rs_signal' },
              decision: {
                action: 'sell',
                reason: 'stable',
                rule_group: 'none',
                target_allocation: {
                  btc: 0,
                  eth: 0,
                  spy: 0,
                  stable: 1,
                  alt: 0,
                },
                immediate: false,
                details: { target_spot_asset: 'ETH' },
              },
              execution: {
                event: 'rebalance',
                transfers: [],
                blocked_reason: null,
                step_count: 0,
                steps_remaining: 0,
                interval_days: 1,
              },
            },
          },
        },
        {
          market: {
            date: '2024-01-04',
            token_price: { btc: 51200 },
            sentiment: 48,
            sentiment_label: 'neutral',
          },
          strategies: {
            eth_btc_rotation_default: {
              portfolio: {
                spot_usd: 8200,
                stable_usd: 2000,
                total_value: 10200,
                spot_asset: 'BTC',
                allocation: { btc: 0.8, eth: 0, spy: 0, stable: 0.2, alt: 0 },
              },
              signal: { id: 'eth_btc_rs_signal' },
              decision: {
                action: 'buy',
                reason: 'back_to_btc',
                rule_group: 'none',
                target_allocation: {
                  btc: 0.8,
                  eth: 0,
                  spy: 0,
                  stable: 0.2,
                  alt: 0,
                },
                immediate: false,
                details: { target_spot_asset: 'BTC' },
              },
              execution: {
                event: null,
                transfers: [],
                blocked_reason: null,
                step_count: 0,
                steps_remaining: 0,
                interval_days: 1,
              },
            },
          },
        },
      ],
    };

    const { result } = renderHook(() => useBacktestResult(response as any));
    const first = result.current.chartData[0] as any;
    const second = result.current.chartData[1] as any;
    const fourth = result.current.chartData[3] as any;

    expect(first.switchToEthSignal).toBeNull();
    expect(second.switchToEthSignal).toBeNull();
    expect(second.eventStrategies.switch_to_eth).toEqual([]);
    expect(fourth.switchToBtcSignal).toBeNull();
  });
});
