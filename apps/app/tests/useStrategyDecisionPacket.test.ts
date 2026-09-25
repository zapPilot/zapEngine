import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';

import { decisionPacketFromSuggestion } from '@/integration/useStrategyDecisionPacket';

const suggestion = {
  as_of: '2026-08-22',
  config_id: 'config',
  config_display_name: 'Strategy',
  strategy_id: 'strategy',
  action: {
    status: 'action_required',
    required: true,
    kind: 'rebalance',
    reason_code: 'eth_btc_ratio_rebalance',
    transfers: [{ from_bucket: 'stable', to_bucket: 'eth', amount_usd: 1000 }],
  },
  context: {
    portfolio: { total_value: 1000, asset_allocation: { stable: 1 } },
    target: { allocation: { btc: 0, eth: 1, spy: 0, stable: 0, alt: 0 } },
    market: { sentiment: 39 },
    signal: {
      regime: 'fear',
      details: { ratio: { ratio: 0.04, ratio_dma_200: 0.038 } },
    },
    strategy: {
      stance: 'buy',
      reason_code: 'ratio',
      rule_group: 'rotation',
      details: {
        matched_rule_name: 'eth_btc_ratio_rotation',
        portfolio_rule_matches: [
          { rule_name: 'cross_down_exit', matched: false, suppressed_by: null },
          {
            rule_name: 'eth_btc_ratio_rotation',
            matched: true,
            suppressed_by: null,
          },
        ],
      },
    },
  },
} as unknown as DailySuggestionResponse;

describe('strategy Decision Packet builders', () => {
  it('combines existing action/status transformers with evidence', () => {
    const result = decisionPacketFromSuggestion(suggestion);
    expect(result.actions[0]).toMatchObject({
      description: 'STABLE -> ETH',
      amount_usd: 1000,
    });
    expect(result.statusPanel.actionCardTitle).toBe('1 Action');
    expect(result.trigger).toMatchObject({
      kind: 'ratio',
      chartSeriesId: 'eth_btc',
    });
    expect(result.allocation.after).toContainEqual({
      label: 'ETH',
      value: 100,
    });
    expect(
      result.ruleTrace.map(({ ruleName, status }) => [ruleName, status]),
    ).toEqual([
      ['cross_down_exit', 'not_matched'],
      ['eth_btc_ratio_rotation', 'fired'],
    ]);
  });
});
