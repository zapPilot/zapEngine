import {
  buildTradeActions,
  type DerivedTradeAction,
  formatRegimeLabel,
  getStatusPanelContent,
} from '@zapengine/app-core/services/suggestion/suggestionTransformers';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@zapengine/app-core/lib/domain/spotAsset', () => ({
  normalizeSpotAsset: vi.fn((value: unknown) =>
    value === 'sol' ? 'SOL' : null,
  ),
}));

interface Transfer {
  from_bucket: string;
  to_bucket: string;
  amount_usd: number;
}

function suggestion(
  overrides: {
    status?: string;
    reason_code?: string;
    transfers?: Transfer[];
    target_spot_asset?: string | null;
  } = {},
): DailySuggestionResponse {
  return {
    context: {
      strategy: {
        details: { target_spot_asset: overrides.target_spot_asset ?? null },
      },
    },
    action: {
      status: overrides.status ?? 'no_action',
      reason_code: overrides.reason_code ?? 'already_aligned',
      transfers: overrides.transfers ?? [],
    },
  } as unknown as DailySuggestionResponse;
}

describe('formatRegimeLabel', () => {
  it('replaces underscores and defaults nullish values to "unknown"', () => {
    expect(formatRegimeLabel('extreme_fear')).toBe('extreme fear');
    expect(formatRegimeLabel(null)).toBe('unknown');
    expect(formatRegimeLabel(undefined)).toBe('unknown');
  });
});

describe('buildTradeActions', () => {
  it('labels every bucket type and derives buy/sell direction', () => {
    const actions = buildTradeActions(
      suggestion({
        target_spot_asset: 'sol',
        transfers: [
          { from_bucket: 'stable', to_bucket: 'eth', amount_usd: 100 },
          { from_bucket: 'btc', to_bucket: 'stable', amount_usd: 50 },
          { from_bucket: 'stable', to_bucket: 'spy', amount_usd: 25 },
          { from_bucket: 'stable', to_bucket: 'spot', amount_usd: 10 },
        ],
      }),
    );

    expect(actions[0]).toMatchObject({
      action: 'buy',
      bucket: 'eth',
      bucketLabel: 'ETH',
    });
    expect(actions[1]).toMatchObject({
      action: 'sell',
      bucket: 'btc',
      bucketLabel: 'BTC',
      description: 'BTC -> STABLE',
    });
    expect(actions[2]).toMatchObject({ action: 'buy', bucketLabel: 'SPY' });
    // spot bucket resolves to the normalized target spot asset label
    expect(actions[3]).toMatchObject({
      action: 'buy',
      bucketLabel: 'SOL',
      description: 'STABLE -> SOL',
    });
  });

  it('falls back to the SPOT label when no target spot asset is set', () => {
    const actions = buildTradeActions(
      suggestion({
        target_spot_asset: null,
        transfers: [
          { from_bucket: 'stable', to_bucket: 'spot', amount_usd: 5 },
        ],
      }),
    );

    expect(actions[0]?.bucketLabel).toBe('SPOT');
  });
});

describe('getStatusPanelContent', () => {
  it('summarizes a single required action', () => {
    const content = getStatusPanelContent(
      suggestion({ status: 'action_required' }),
      [{ action: 'buy' } as DerivedTradeAction],
    );

    expect(content).toMatchObject({
      actionCardTitle: '1 Action',
      ctaLabel: 'Review & Execute All',
      ctaDisabled: false,
    });
  });

  it('pluralizes multiple required actions', () => {
    const content = getStatusPanelContent(
      suggestion({ status: 'action_required' }),
      [{ action: 'buy' }, { action: 'sell' }] as DerivedTradeAction[],
    );

    expect(content.actionCardTitle).toBe('2 Actions');
  });

  it('renders a blocked status with a mapped reason label', () => {
    const content = getStatusPanelContent(
      suggestion({ status: 'blocked', reason_code: 'interval_wait' }),
      [],
    );

    expect(content).toMatchObject({
      actionCardTitle: 'Action Blocked',
      ctaDisabled: true,
    });
    expect(content.bodyDescription).toBe(
      'Minimum rebalance interval has not elapsed yet.',
    );
  });

  it('humanizes an unmapped reason code for the no-trades state', () => {
    const content = getStatusPanelContent(
      suggestion({ status: 'no_action', reason_code: 'some_custom-reason' }),
      [],
    );

    expect(content.actionCardTitle).toBe('0 Actions');
    expect(content.bodyDescription).toBe('Some custom reason.');
  });

  it('uses a default description when the reason code is empty after normalizing', () => {
    const content = getStatusPanelContent(
      suggestion({ status: 'no_action', reason_code: '___' }),
      [],
    );

    expect(content.bodyDescription).toBe('No additional context.');
  });
});
