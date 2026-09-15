import {
  type DailySuggestionSubset,
  DailySuggestionSubsetSchema,
} from '../../../../src/modules/notifications/analytics-client/daily-suggestion.schema';
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

describe('decision packet branch sweep', () => {
  // Each test names the previously-uncovered branch it locks.
  // mutation: not run (offline sandbox — vitest could not be executed here).

  function mutate(
    recipe: (draft: DailySuggestionSubset) => void,
  ): DailySuggestionSubset {
    const draft = structuredClone(suggestion());
    recipe(draft);
    return DailySuggestionSubsetSchema.parse(draft);
  }

  it('locks the header fallback title for a no-action verdict', () => {
    // Locks: header() else branch (status neither action_required nor blocked).
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        draft.action.status = 'no_action_needed';
        draft.action.transfers = [];
      }),
    );
    expect(message).toContain('✅ *No Action Needed*');
  });

  it('locks the absent-allocation path in formatAllocation/targetBlock', () => {
    // Locks: formatAllocation `!allocation` true; targetBlock `before ? … : null` false.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        draft.context.portfolio.asset_allocation = null;
      }),
    );
    expect(message).not.toContain('Before:');
    expect(message).toContain('After:');
  });

  it('locks the humanizeSlug fallback for unknown allocation keys', () => {
    // Locks: ALLOCATION_LABELS ?? humanizeSlug fallback; prioritized flatMap
    // `value === undefined` true (no prioritized key present).
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        draft.context.portfolio.asset_allocation = { two_sigma: 0.5 };
      }),
    );
    expect(message).toContain('Before: Two sigma 50.0%');
  });

  it('locks the null matched-rule fallback to reason_code', () => {
    // Locks: triggerBlock `rule ?? reason_code`; triggerEvidenceLine `rule?.`
    // nullish short-circuits; `if (evidence)` false.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const details = draft.context.strategy.details;
        if (details) details.matched_rule_name = null;
      }),
    );
    expect(message).toContain('Rule: Eth btc ratio rebalance');
  });

  it('locks absent ratio details for an eth_btc_ rule', () => {
    // Locks: ratioEvidence `ratio?.ratio` nullish short-circuit;
    // triggeredIndicator ratio nullish → formatCooldown 'none'.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const details = draft.context.signal.details;
        if (details) details.ratio = null;
      }),
    );
    expect(message).toContain('*TRIGGER*');
    expect(message).not.toContain('Ratio 0.');
    expect(message).toContain('Cooldown: none');
  });

  it.each([
    [{ ratio: null, ratio_dma_200: 0.0371 }],
    [{ ratio: 0.03921, ratio_dma_200: null }],
  ])('locks ratio evidence with missing values %j', (ratioPatch) => {
    // Locks: `ratio?.ratio == null` true (value-null) and
    // `ratio.ratio_dma_200 == null` true (second operand).
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const details = draft.context.signal.details;
        if (details?.ratio) Object.assign(details.ratio, ratioPatch);
      }),
    );
    expect(message).not.toContain('Ratio 0.');
  });

  it('locks absent dma details for a cross_ rule', () => {
    // Locks: dmaEvidence `dma?.dma_200` nullish short-circuit.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const strategyDetails = draft.context.strategy.details;
        if (strategyDetails)
          strategyDetails.matched_rule_name = 'cross_down_exit';
        const signalDetails = draft.context.signal.details;
        if (signalDetails) signalDetails.dma = null;
      }),
    );
    expect(message).not.toContain('200-DMA');
  });

  it('locks dma evidence with a null dma_200', () => {
    // Locks: `dma?.dma_200 == null` true (value-null variant).
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const strategyDetails = draft.context.strategy.details;
        if (strategyDetails)
          strategyDetails.matched_rule_name = 'cross_down_exit';
        const signalDetails = draft.context.signal.details;
        if (signalDetails) signalDetails.dma = { dma_200: null };
      }),
    );
    expect(message).not.toContain('200-DMA');
  });

  it('locks dma evidence without asset/distance/cross metadata', () => {
    // Locks: `asset ? … : ''` false; formatDistance null true; formatCross falsy.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const strategyDetails = draft.context.strategy.details;
        if (strategyDetails)
          strategyDetails.matched_rule_name = 'cross_down_exit';
        const signalDetails = draft.context.signal.details;
        if (signalDetails)
          signalDetails.dma = {
            dma_200: 92000,
            distance: null,
            cross_event: null,
            outer_dma_asset: null,
          };
      }),
    );
    expect(message).toContain('200-DMA 92000.00');
    expect(message).not.toContain('BTC ·');
  });

  it('locks the dma_overextension_ evidence dispatch', () => {
    // Locks: triggerEvidenceLine `cross_ || dma_overextension_` second operand true.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const details = draft.context.strategy.details;
        if (details) details.matched_rule_name = 'dma_overextension_buy';
      }),
    );
    expect(message).toContain('BTC · 200-DMA 92000.00 (+12.0%)');
  });

  it.each([
    [12.345, '(+12.3%)'],
    [-3.21, '(-3.2%)'],
  ])('locks full-percent distance formatting for %d', (distance, expected) => {
    // Locks: formatSignedPercent `|value| > 1` branch (positive and negative).
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const details = draft.context.signal.details;
        if (details?.ratio) details.ratio.distance = distance;
      }),
    );
    expect(message).toContain(`Ratio 0.03921 vs 200-DMA 0.03710 ${expected}`);
  });

  it('locks macro fear-greed score/label overrides', () => {
    // Locks: `market?.macro_fear_greed?.score/label ?? …` left-defined
    // outcomes in both fgiEvidence and checksBlock.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const details = draft.context.strategy.details;
        if (details) details.matched_rule_name = 'fgi_downshift_dca_sell';
        draft.context.market = {
          macro_fear_greed: { score: 25, label: 'Extreme Fear' },
        };
      }),
    );
    expect(message).toContain('FGI 25 (Extreme Fear)');
  });

  it('locks unavailable market data and unknown regime fallbacks', () => {
    // Locks: `market?.` nullish short-circuits; `score ?? 'unavailable'`;
    // `label ? … : ''` false in checksBlock; `REGIME_EMOJI[regime] ?? '⚪'`.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        draft.context.market = null;
        draft.context.signal.regime = 'weird_regime';
      }),
    );
    expect(message).toContain('FGI unavailable · Regime ⚪ Weird regime');
  });

  it('locks fgi evidence with missing score and slope', () => {
    // Locks: fgiEvidence `score == null` true; `slope == null` true;
    // `details?.dma?.fgi_slope` short-circuits.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const details = draft.context.strategy.details;
        if (details) details.matched_rule_name = 'fgi_downshift_dca_sell';
        draft.context.signal.details = null;
        draft.context.market = { sentiment: null, sentiment_label: null };
      }),
    );
    expect(message).toContain('*TRIGGER*\nRule: Fgi downshift dca sell\n\n');
  });

  it('locks fgi evidence with a score but no label', () => {
    // Locks: `label ? (label) : ''` false in fgiEvidence.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const details = draft.context.strategy.details;
        if (details) details.matched_rule_name = 'fgi_downshift_dca_sell';
        draft.context.market = { sentiment: 10, sentiment_label: null };
      }),
    );
    expect(message).toContain('FGI 10\nFGI slope -8.0%');
  });

  it('locks active cooldown without remaining days', () => {
    // Locks: formatCooldown `cooldown_remaining_days == null` true → 'active'.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        const details = draft.context.signal.details;
        if (details)
          details.ratio = {
            cooldown_active: true,
            cooldown_remaining_days: null,
          };
      }),
    );
    expect(message).toContain('Cooldown: active\n');
  });

  it('locks quota when strategy details are unavailable', () => {
    // Locks: formatQuota `details?.enabled == null` true → 'Quota: data unavailable'.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        draft.context.strategy.details = null;
      }),
    );
    expect(message).toContain('Quota: data unavailable');
  });

  it.each([
    [
      { trades_7d: null, max_trades_7d: 3, next_trade_date: '2026-08-25' },
      'Trades 7d: unavailable · next trade 2026-08-25',
    ],
    [{ trades_7d: 2, max_trades_7d: null }, 'Trades 7d: unavailable'],
  ])('locks quota formatting for %j', (detailsPatch, expected) => {
    // Locks: `trades_7d != null` false and `max_trades_7d != null` false.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        draft.context.strategy.details = {
          matched_rule_name: 'eth_btc_ratio_rotation',
          enabled: true,
          ...detailsPatch,
        };
      }),
    );
    expect(message).toContain(expected);
  });

  it('locks quota without a next trade date', () => {
    // Locks: `next_trade_date ? … : null` false.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        draft.context.strategy.details = {
          matched_rule_name: 'eth_btc_ratio_rotation',
          enabled: true,
          trades_7d: 2,
          max_trades_7d: 3,
          next_trade_date: null,
        };
      }),
    );
    expect(message).toContain('Trades 7d: 2/3');
    expect(message).not.toContain('next trade');
  });

  it('locks absent signal details for a ratio rule', () => {
    // Locks: triggerEvidenceLine `signal?.ratio` short-circuit;
    // triggeredIndicator `details?.` short-circuits.
    const { message } = buildDecisionPacketMessage(
      mutate((draft) => {
        draft.context.signal.details = null;
      }),
    );
    expect(message).toContain('Cooldown: none');
    expect(message).not.toContain('Ratio 0.');
  });

  it('locks each malformed callback-data guard', () => {
    // Locks: `prefix !== DAILY_SUGGESTION_DONE_PREFIX`, `!configId`,
    // `rest.length > 0` true outcomes (`!strategyId` is locked above).
    expect(parseDailySuggestionDoneCallbackData('other|c|s')).toBeNull();
    expect(parseDailySuggestionDoneCallbackData('dsdone||s')).toBeNull();
    expect(parseDailySuggestionDoneCallbackData('dsdone|c|s|x')).toBeNull();
  });
});
