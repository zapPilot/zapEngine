import type { DailySuggestionResponse } from '@zapengine/app-core/services';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const suggestionMocks = vi.hoisted(() => ({
  getDailySuggestion: vi.fn(),
  getRuntimeEnv: vi.fn(),
}));

vi.mock('@zapengine/app-core/lib/env/runtimeEnv', () => ({
  getRuntimeEnv: suggestionMocks.getRuntimeEnv,
}));

vi.mock('@zapengine/app-core/services', () => ({
  getDailySuggestion: suggestionMocks.getDailySuggestion,
}));

import { createSuggestionDriftReader } from '../src/main/scheduler/suggestionDriftReader';

const CONTEXT = {
  userId: 'user-1',
  walletAddress: '0x1111111111111111111111111111111111111111',
};

const ASSET_ALLOCATION = {
  alt: 0,
  btc: 0.6,
  eth: 0.1,
  spy: 0,
  stable: 0.3,
};

function makeDailySuggestion(
  overrides: Partial<DailySuggestionResponse> = {},
): DailySuggestionResponse {
  return {
    as_of: '2026-07-04',
    config_display_name: 'Default',
    config_id: 'default',
    strategy_id: 'strategy-default',
    action: {
      kind: 'rebalance',
      reason_code: 'rebalance_needed',
      required: true,
      status: 'action_required',
      transfers: [{ amount_usd: 500, from_bucket: 'btc', to_bucket: 'stable' }],
    },
    context: {
      market: {
        date: '2026-07-04',
        macro_fear_greed: {
          label: 'Neutral',
          score: 50,
          source: 'alternative.me',
          updated_at: '2026-07-04T00:00:00.000Z',
        },
        sentiment: 50,
        sentiment_label: 'Neutral',
        token_price: { BTC: 100000 },
      },
      portfolio: {
        allocation: { spot: 0.7, stable: 0.3 },
        asset_allocation: ASSET_ALLOCATION,
        spot_asset: 'BTC',
        spot_usd: 7000,
        stable_usd: 3000,
        total_value: 10000,
      },
      signal: {
        confidence: 0.8,
        id: 'dma',
        raw_value: 1,
        regime: 'risk_on',
      },
      strategy: {
        reason_code: 'none',
        rule_group: 'none',
        stance: 'hold',
      },
      target: {
        allocation: ASSET_ALLOCATION,
      },
    },
    data_freshness: null,
    ...overrides,
  };
}

describe('createSuggestionDriftReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    suggestionMocks.getRuntimeEnv.mockReturnValue('http://localhost:8001');
  });

  it('skips reads and logs when analytics URL is not configured', async () => {
    const log = vi.fn();
    suggestionMocks.getRuntimeEnv.mockReturnValue('');

    const result = await createSuggestionDriftReader({ log })(CONTEXT);

    expect(result).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      'scheduler: VITE_ANALYTICS_ENGINE_URL is not configured; skipping',
    );
    expect(suggestionMocks.getDailySuggestion).not.toHaveBeenCalled();
  });

  it('returns undefined when the suggestion has no required action', async () => {
    suggestionMocks.getDailySuggestion.mockResolvedValue(
      makeDailySuggestion({
        action: {
          kind: null,
          reason_code: 'within_threshold',
          required: false,
          status: 'no_action',
          transfers: [],
        },
      }),
    );

    const result = await createSuggestionDriftReader()(CONTEXT);

    expect(result).toBeUndefined();
    expect(suggestionMocks.getDailySuggestion).toHaveBeenCalledWith('user-1');
  });

  it('calculates drift as transfer volume divided by portfolio value', async () => {
    suggestionMocks.getDailySuggestion.mockResolvedValue(
      makeDailySuggestion({
        action: {
          kind: 'rebalance',
          reason_code: 'rebalance_needed',
          required: true,
          status: 'action_required',
          transfers: [
            { amount_usd: 500, from_bucket: 'btc', to_bucket: 'stable' },
            { amount_usd: 250, from_bucket: 'eth', to_bucket: 'stable' },
          ],
        },
      }),
    );

    const result = await createSuggestionDriftReader()(CONTEXT);

    expect(result).toEqual({ driftPercent: 7.5 });
  });

  it('uses sentinel drift when actionable transfer volume cannot be normalized', async () => {
    suggestionMocks.getDailySuggestion.mockResolvedValue(
      makeDailySuggestion({
        context: {
          ...makeDailySuggestion().context,
          portfolio: {
            ...makeDailySuggestion().context.portfolio,
            total_value: 0,
          },
        },
      }),
    );

    const result = await createSuggestionDriftReader()(CONTEXT);

    expect(result).toEqual({ driftPercent: 100 });
  });
});
