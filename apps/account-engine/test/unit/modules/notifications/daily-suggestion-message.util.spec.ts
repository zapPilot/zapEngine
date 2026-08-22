import { DailySuggestionSubsetSchema } from '../../../../src/modules/notifications/analytics-client/daily-suggestion.schema';
import {
  buildDecisionPacketMessage,
  encodeDailySuggestionDoneCallbackData,
  parseDailySuggestionDoneCallbackData,
} from '../../../../src/modules/notifications/daily-suggestion-message.util';

function suggestion(
  rule = 'eth_btc_ratio_rotation',
  status = 'action_required',
) {
  return DailySuggestionSubsetSchema.parse({
    as_of: '2026-08-22',
    config_id: 'operator_config',
    config_display_name: 'Operator Strategy',
    strategy_id: 'dma_strategy',
    action: {
      status,
      required: status === 'action_required',
      reason_code: 'eth_btc_ratio_rebalance',
      transfers:
        status === 'action_required'
          ? [{ from_bucket: 'stable', to_bucket: 'eth', amount_usd: 95150 }]
          : [],
    },
    context: {
      portfolio: { total_value: 100000, asset_allocation: { stable: 1 } },
      target: { allocation: { btc: 0, eth: 0.9515, stable: 0.0485 } },
      signal: {
        regime: 'fear',
        details: {
          ratio: {
            ratio: 0.03921,
            ratio_dma_200: 0.0371,
            distance: 0.057,
            cross_event: 'crossed_up',
            cooldown_active: false,
          },
          dma: {
            dma_200: 92000,
            distance: 0.12,
            outer_dma_asset: 'btc',
            cooldown_active: true,
            cooldown_remaining_days: 3,
            fgi_slope: -0.08,
          },
          spy_dma: {
            dma_200: 615,
            distance: -0.03,
            cross_event: 'crossed_down',
            cooldown_active: false,
          },
        },
      },
      market: { sentiment: 39, sentiment_label: 'Fear' },
      strategy: {
        details: {
          matched_rule_name: rule,
          enabled: true,
          trades_7d: 2,
          max_trades_7d: 3,
          next_trade_date: '2026-08-25',
        },
      },
    },
  });
}

describe('daily suggestion Decision Packet', () => {
  it('formats ratio evidence, checks, target, and Done button', () => {
    const payload = buildDecisionPacketMessage(suggestion());
    expect(payload.message).toContain(
      '🔁 *Rebalance Needed — Operator Strategy*',
    );
    expect(payload.message).toContain('Move $95,150 from STABLE to ETH');
    expect(payload.message).toContain(
      'Ratio 0.03921 vs 200-DMA 0.03710 (+5.7%) — Crossed up',
    );
    expect(payload.message).toContain('Trades 7d: 2/3 · next trade 2026-08-25');
    expect(payload.replyMarkup?.inline_keyboard[0]?.[0]?.text).toBe('☑️ Done');
  });

  it.each([
    ['cross_down_exit', 'BTC · 200-DMA 92000.00'],
    ['spy_latch', 'SPY · 200-DMA 615.00'],
    ['fgi_downshift_dca_sell', 'FGI slope -8.0%'],
    ['new_unknown_rule', 'Rule: New unknown rule'],
  ])('dispatches %s evidence', (rule, expected) => {
    expect(buildDecisionPacketMessage(suggestion(rule)).message).toContain(
      expected,
    );
  });

  it('does not attach Done to blocked/no-action or oversized callbacks', () => {
    expect(
      buildDecisionPacketMessage(suggestion('trade_quota', 'blocked'))
        .replyMarkup,
    ).toBeUndefined();
    const oversized = suggestion();
    oversized.config_id = 'x'.repeat(70);
    expect(buildDecisionPacketMessage(oversized).replyMarkup).toBeUndefined();
  });

  it('caps transfers and keeps underscores out of Markdown prose', () => {
    const value = suggestion();
    value.action.transfers.push(
      ...Array.from({ length: 4 }, (_, index) => ({
        from_bucket: 'stable_bucket',
        to_bucket: 'eth_bucket',
        amount_usd: index + 1,
      })),
    );
    const message = buildDecisionPacketMessage(value).message;
    expect(message).toContain('+2 more');
    expect(message.replaceAll(/`[^`]*`/g, '')).not.toContain('_');
  });

  it('round-trips callback data and rejects malformed values', () => {
    const encoded = encodeDailySuggestionDoneCallbackData('config', 'strategy');
    expect(parseDailySuggestionDoneCallbackData(encoded)).toEqual({
      configId: 'config',
      strategyId: 'strategy',
    });
    expect(parseDailySuggestionDoneCallbackData('dsdone|only')).toBeNull();
  });
});
