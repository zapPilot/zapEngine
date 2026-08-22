import {
  deriveAllocationDiff,
  deriveGuardStates,
  deriveTriggerEvidence,
} from '../../src/services/suggestion/suggestionEvidence';

function fixture(rule: string, asset?: string) {
  return {
    action: { reason_code: 'fallback_reason', extra: true },
    context: {
      portfolio: { asset_allocation: { btc: 0.4, stable: 0.6 } },
      target: { allocation: { btc: 0.2, eth: 0.8 } },
      market: { sentiment: 39, sentiment_label: 'Fear' },
      signal: {
        regime: 'fear',
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
            fgi_slope: -0.1,
          },
          spy_dma: { dma_200: 600, cooldown_active: false },
        },
      },
      strategy: {
        details: {
          matched_rule_name: rule,
          enabled: true,
          trades_7d: 1,
          max_trades_7d: 3,
          cooldown_skipped_rules: ['other_rule'],
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
    ['spy_latch', 'spy_dma', 'spy'],
    ['fgi_downshift_dca_sell', 'fgi', null],
  ])('maps %s to evidence and chart series', (rule, kind, series) => {
    const evidence = deriveTriggerEvidence(
      fixture(rule, rule.startsWith('dma_') ? 'ETH' : undefined),
    );
    expect(evidence).toMatchObject({ kind, chartSeriesId: series });
  });

  it('degrades malformed evidence safely', () => {
    expect(deriveTriggerEvidence({ nope: true }).kind).toBe('none');
    expect(deriveGuardStates({ nope: true }).quota).toBe('unavailable');
  });

  it('derives guard state and allocation rows', () => {
    const data = fixture('cross_up_equal_weight');
    expect(deriveGuardStates(data)).toMatchObject({
      cooldown: { active: true, remainingDays: 2 },
      quota: { trades7d: 1, maxTrades7d: 3 },
      skippedRules: ['other_rule'],
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
});
