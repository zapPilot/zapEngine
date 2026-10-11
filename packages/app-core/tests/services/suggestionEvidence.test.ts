import {
  deriveAllocationDiff,
  deriveGuardStates,
  deriveRuleTrace,
  deriveTriggerEvidence,
} from '../../src/services/suggestion/suggestionEvidence';

function fixture(rule: string, asset?: string) {
  return {
    action: { reason_code: 'fallback_reason', extra: true },
    context: {
      portfolio: { asset_allocation: { btc: 0.4, stable: 0.6 } },
      target: { allocation: { btc: 0.2, eth: 0.8 } },
      signal: {
        details: {
          ratio: {
            ratio: 0.04,
            ratio_dma_200: 0.038,
            distance: 0.05,
            cooldown_active: false,
          },
          dma: {
            dma_200: 90000,
            distance: 0.1,
            outer_dma_asset: asset,
            cooldown_active: true,
            cooldown_remaining_days: 2,
          },
        },
      },
      strategy: {
        details: {
          matched_rule_name: rule,
          // Backend shape (portfolio_rules/_matcher.py): one object per rule.
          cooldown_skipped_rules: [
            {
              rule: 'cross_down_exit',
              last_executed_at: '2026-08-10',
              cooldown_days: 30,
              remaining_days: 4,
              trigger_symbols: ['BTC'],
              symbol_cooldowns: [
                {
                  symbol: 'BTC',
                  last_executed_at: '2026-08-10',
                  remaining_days: 4,
                },
              ],
            },
          ],
          portfolio_rule_matches: [
            {
              rule_name: 'cross_down_exit',
              matched: true,
              would_have_acted_action: 'sell',
              suppressed_by: null,
            },
            {
              rule_name: 'eth_btc_ratio_rotation',
              matched: false,
              would_have_acted_action: null,
              suppressed_by: null,
            },
            {
              rule_name: rule,
              matched: true,
              would_have_acted_action: 'sell',
              suppressed_by: null,
            },
            {
              rule_name: 'eth_btc_deviation_dca',
              matched: true,
              would_have_acted_action: 'sell',
              suppressed_by: rule,
            },
            {
              rule_name: 'cross_up_equal_weight',
              matched: true,
              would_have_acted_action: 'buy',
              suppressed_by: null,
            },
          ],
        },
      },
    },
  };
}

describe('suggestion evidence', () => {
  it.each([
    ['eth_btc_ratio_rotation', 'ratio', 'eth_btc'],
    ['cross_down_exit', 'dma', 'btc'],
    ['dma_overextension_dca_sell', 'dma', 'eth'],
  ])('maps %s to evidence and chart series', (rule, kind, series) => {
    const evidence = deriveTriggerEvidence(
      fixture(rule, rule.startsWith('dma_') ? 'ETH' : undefined),
    );
    expect(evidence).toMatchObject({ kind, chartSeriesId: series });
  });

  it('degrades malformed evidence safely', () => {
    expect(deriveTriggerEvidence({ nope: true }).kind).toBe('none');
    expect(deriveGuardStates({ nope: true })).toEqual({
      cooldown: 'unavailable',
    });
  });

  it('derives guard state and allocation rows', () => {
    const data = fixture('dma_overextension_dca_sell');
    expect(deriveGuardStates(data)).toEqual({
      cooldown: { active: true, remainingDays: 2 },
    });
    expect(deriveAllocationDiff(data)).toEqual({
      before: [
        { label: 'BTC', value: 40 },
        { label: 'STABLE', value: 60 },
      ],
      after: [
        { label: 'BTC', value: 20 },
        { label: 'ETH', value: 80 },
      ],
    });
  });

  it('keeps evidence when matching rules were skipped for cooldown', () => {
    const data = fixture('regime_no_signal_hold');
    data.action.reason_code = 'regime_no_signal';
    expect(deriveTriggerEvidence(data)).toMatchObject({
      kind: 'none',
      ruleName: 'regime_no_signal_hold',
      ruleLabel: 'Regime no signal',
    });
    expect(deriveRuleTrace(data)[0]).toMatchObject({
      ruleName: 'cross_down_exit',
      status: 'cooldown',
      cooldownRemainingDays: 4,
    });
    expect(deriveAllocationDiff(data).before).toEqual([
      { label: 'BTC', value: 40 },
      { label: 'STABLE', value: 60 },
    ]);
  });

  it('uses reason-code evidence when no matched rule is present', () => {
    const data = fixture('cross_up_equal_weight');
    data.context.strategy.details.matched_rule_name = null as never;
    expect(deriveTriggerEvidence(data)).toMatchObject({
      kind: 'none',
      ruleName: null,
      ruleLabel: 'Fallback reason',
    });
  });

  it('falls back to none evidence for unknown rule families', () => {
    expect(deriveTriggerEvidence(fixture('unknown_rule'))).toMatchObject({
      kind: 'none',
      ruleName: 'unknown_rule',
      ruleLabel: 'Fallback reason',
    });
  });

  it('selects SPY and BTC DMA chart series from the outer asset', () => {
    expect(
      deriveTriggerEvidence(fixture('cross_up', 'SPY')).chartSeriesId,
    ).toBe('spy');
    expect(
      deriveTriggerEvidence(fixture('cross_up', 'SOL')).chartSeriesId,
    ).toBe('btc');
  });

  it('omits null evidence metrics and formats large positive percentages', () => {
    const data = fixture('cross_up');
    data.context.signal.details.dma = {
      dma_200: null,
      distance: 12.5,
      outer_dma_asset: 'BTC',
      cross_event: null,
      cooldown_active: null,
    } as never;
    expect(deriveTriggerEvidence(data).metrics).toEqual([
      { label: 'Asset', value: 'BTC' },
      { label: 'Distance', value: '+12.5%' },
    ]);
  });

  it('formats a negative distance without a plus sign', () => {
    const data = fixture('cross_down_exit');
    data.context.signal.details.dma.distance = -0.032;
    expect(deriveTriggerEvidence(data).metrics).toContainEqual({
      label: 'Distance',
      value: '-3.2%',
    });
  });

  it('omits the distance metric when the backend sends no distance', () => {
    const data = fixture('eth_btc_ratio_rotation');
    data.context.signal.details.ratio = {
      ratio: 0.04,
      ratio_dma_200: 0.038,
    } as never;
    expect(deriveTriggerEvidence(data).metrics).toEqual([
      { label: 'Ratio', value: '0.04' },
      { label: '200-DMA', value: '0.038' },
    ]);
  });

  it('selects ratio and DMA guard indicators and exposes the unavailable state', () => {
    expect(
      deriveGuardStates(fixture('eth_btc_ratio_rotation')).cooldown,
    ).toEqual({ active: false, remainingDays: null });

    const unavailable = fixture('cross_up');
    unavailable.context.signal.details.dma = {} as never;
    expect(deriveGuardStates(unavailable)).toEqual({
      cooldown: 'unavailable',
    });
  });

  it('handles malformed and sparse allocation maps', () => {
    expect(deriveAllocationDiff({ nope: true })).toEqual({
      before: [],
      after: [],
    });
    const data = fixture('cross_up');
    data.context.portfolio.asset_allocation = null as never;
    data.context.target.allocation = { btc: 0.0001, eth: -0.0004, spy: 0.1 };
    expect(deriveAllocationDiff(data)).toEqual({
      before: [],
      after: [{ label: 'SPY', value: 10 }],
    });
  });

  it('keeps trigger evidence when cooldown skips arrive as backend objects', () => {
    const evidence = deriveTriggerEvidence(
      fixture('dma_overextension_dca_sell', 'BTC'),
    );
    expect(evidence).toMatchObject({
      kind: 'dma',
      ruleName: 'dma_overextension_dca_sell',
      chartSeriesId: 'btc',
    });
    expect(evidence.metrics).toContainEqual({
      label: 'Distance',
      value: '+10.0%',
    });
    expect(
      deriveGuardStates(fixture('dma_overextension_dca_sell')).cooldown,
    ).not.toBe('unavailable');
  });

  it('explains every evaluated rule in priority order', () => {
    expect(deriveRuleTrace(fixture('dma_overextension_dca_sell'))).toEqual([
      {
        ruleName: 'cross_down_exit',
        status: 'cooldown',
        suppressedBy: null,
        cooldownRemainingDays: 4,
      },
      {
        ruleName: 'eth_btc_ratio_rotation',
        status: 'not_matched',
        suppressedBy: null,
        cooldownRemainingDays: null,
      },
      {
        ruleName: 'dma_overextension_dca_sell',
        status: 'fired',
        suppressedBy: null,
        cooldownRemainingDays: null,
      },
      {
        ruleName: 'eth_btc_deviation_dca',
        status: 'shadowed',
        suppressedBy: 'dma_overextension_dca_sell',
        cooldownRemainingDays: null,
      },
      {
        ruleName: 'cross_up_equal_weight',
        status: 'inactive',
        suppressedBy: null,
        cooldownRemainingDays: null,
      },
    ]);
  });

  it('returns an empty trace when the backend omits or garbles it', () => {
    const missing = fixture('cross_up');
    delete (
      missing.context.strategy.details as { portfolio_rule_matches?: unknown }
    ).portfolio_rule_matches;
    expect(deriveRuleTrace(missing)).toEqual([]);

    const garbled = fixture('cross_up');
    garbled.context.strategy.details.portfolio_rule_matches = [
      'cross_up',
    ] as never;
    expect(deriveRuleTrace(garbled)).toEqual([]);
    // A garbled trace must not take the trigger evidence down with it.
    expect(deriveTriggerEvidence(garbled).kind).toBe('dma');
  });

  it('treats an omitted cooldown list as empty', () => {
    const data = fixture('cross_up');
    delete (
      data.context.strategy.details as { cooldown_skipped_rules?: unknown }
    ).cooldown_skipped_rules;
    expect(
      deriveRuleTrace(data).every(
        (entry) => entry.cooldownRemainingDays === null,
      ),
    ).toBe(true);
  });

  it('reports cooldown without a day count when the backend omits it', () => {
    const data = fixture('dma_overextension_dca_sell');
    data.context.strategy.details.cooldown_skipped_rules = [
      { rule: 'cross_down_exit' },
    ] as never;
    expect(deriveRuleTrace(data)[0]).toEqual({
      ruleName: 'cross_down_exit',
      status: 'cooldown',
      suppressedBy: null,
      cooldownRemainingDays: null,
    });
  });
});
