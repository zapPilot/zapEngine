import { DailySuggestionSubsetSchema } from '../../../../src/modules/notifications/analytics-client/daily-suggestion.schema';

function fixture() {
  return {
    as_of: '2026-08-22',
    config_id: 'operator_config',
    config_display_name: 'Operator Strategy',
    strategy_id: 'dma_strategy',
    action: {
      status: 'action_required',
      required: true,
      reason_code: 'eth_btc_ratio_rebalance',
      transfers: [
        { from_bucket: 'stable', to_bucket: 'eth', amount_usd: 95150 },
      ],
    },
    context: {
      portfolio: { total_value: 100000, asset_allocation: { stable: 1 } },
      target: { allocation: { eth: 0.95, stable: 0.05 } },
      signal: { regime: 'fear', details: {} },
      market: {},
      strategy: { details: {} },
    },
  };
}

describe('DailySuggestionSubsetSchema', () => {
  it('accepts missing evidence and strips unknown fields', () => {
    const result = DailySuggestionSubsetSchema.parse({
      ...fixture(),
      future_field: true,
    });
    expect(result).not.toHaveProperty('future_field');
    expect(result.context.signal.details?.ratio).toBeUndefined();
  });

  it.each(['config_id', 'strategy_id'] as const)(
    'rejects missing %s',
    (field) => {
      const value = fixture();
      delete value[field];
      expect(DailySuggestionSubsetSchema.safeParse(value).success).toBe(false);
    },
  );

  it('rejects an action without transfers', () => {
    const value = fixture();
    delete (value.action as Partial<typeof value.action>).transfers;
    expect(DailySuggestionSubsetSchema.safeParse(value).success).toBe(false);
  });
});
