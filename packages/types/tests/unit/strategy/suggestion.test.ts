import { describe, expect, it } from 'vitest';

import {
  DailySuggestionActionSchema,
  DailySuggestionActionStatusSchema,
  DailySuggestionContextSchema,
  DailySuggestionModelSchema,
  DailySuggestionResponseSchema,
  DailySuggestionStrategyContextSchema,
} from '../../../src/strategy/suggestion.js';

describe('DailySuggestionActionStatusSchema', () => {
  it.each([['action_required'], ['blocked'], ['no_action']])(
    'accepts %s',
    (status) => {
      expect(DailySuggestionActionStatusSchema.safeParse(status).success).toBe(
        true,
      );
    },
  );

  it('rejects an unknown status', () => {
    expect(
      DailySuggestionActionStatusSchema.safeParse('completed').success,
    ).toBe(false);
  });
});

describe('DailySuggestionActionSchema', () => {
  const valid = {
    status: 'no_action' as const,
    required: false,
    kind: null,
    reason_code: 'in_range',
    transfers: [],
  };

  it('accepts an action with kind=null (no rebalance)', () => {
    expect(DailySuggestionActionSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an action with kind="rebalance"', () => {
    expect(
      DailySuggestionActionSchema.safeParse({
        ...valid,
        kind: 'rebalance',
        status: 'action_required',
        required: true,
      }).success,
    ).toBe(true);
  });

  it('rejects a kind value other than "rebalance" or null', () => {
    expect(
      DailySuggestionActionSchema.safeParse({ ...valid, kind: 'swap' }).success,
    ).toBe(false);
  });

  it('rejects when transfers is missing', () => {
    const { transfers: _, ...withoutTransfers } = valid;
    expect(
      DailySuggestionActionSchema.safeParse(withoutTransfers).success,
    ).toBe(false);
  });
});

describe('DailySuggestionStrategyContextSchema', () => {
  it.each([['buy'], ['sell'], ['hold']])('accepts stance %s', (stance) => {
    expect(
      DailySuggestionStrategyContextSchema.safeParse({
        stance,
        reason_code: 'r',
        rule_group: 'none',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown rule_group', () => {
    expect(
      DailySuggestionStrategyContextSchema.safeParse({
        stance: 'hold',
        reason_code: 'r',
        rule_group: 'made-up',
      }).success,
    ).toBe(false);
  });
});

describe('DailySuggestionModelSchema', () => {
  const period = {
    start_date: '2025-02-20',
    end_date: '2026-07-03',
    days: 499,
  };
  const valid = {
    allocation: { btc: 0, eth: 0.1, spy: 0.9, stable: 0, alt: 0 },
    window: { requested: period, effective: period, truncated: false },
  };

  it('accepts the model holdings with the window it was replayed over', () => {
    expect(DailySuggestionModelSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a model without its replay window', () => {
    const { window: _, ...withoutWindow } = valid;
    expect(DailySuggestionModelSchema.safeParse(withoutWindow).success).toBe(
      false,
    );
  });

  it('is required on the suggestion context', () => {
    expect(DailySuggestionContextSchema.shape.model).toBe(
      DailySuggestionModelSchema,
    );
  });
});

describe('DailySuggestionResponseSchema', () => {
  it('rejects a response missing required top-level fields', () => {
    expect(DailySuggestionResponseSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a response missing the context block', () => {
    expect(
      DailySuggestionResponseSchema.safeParse({
        as_of: '2026-05-21',
        config_id: 'cfg',
        config_display_name: 'Balanced',
        strategy_id: 'balanced',
        spec_ref: 'reference/dma_fgi@2#ffc3614028fb',
        action: {
          status: 'no_action',
          required: false,
          kind: null,
          reason_code: 'r',
          transfers: [],
        },
      }).success,
    ).toBe(false);
  });
});
