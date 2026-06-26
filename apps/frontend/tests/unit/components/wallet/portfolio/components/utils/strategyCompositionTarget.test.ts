import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { describe, expect, it } from 'vitest';

import { toCompositionTargetFromSuggestion } from '@/components/wallet/portfolio/components/utils/strategyCompositionTarget';

function makeSuggestion(overrides?: {
  current?: DailySuggestionResponse['context']['portfolio']['asset_allocation'];
  target?: DailySuggestionResponse['context']['target']['allocation'];
}): DailySuggestionResponse {
  return {
    as_of: '2026-05-18',
    config_id: 'dma_fgi_portfolio_rules_default',
    config_display_name: 'DMA FGI Default',
    strategy_id: 'dma_fgi_portfolio_rules',
    action: {
      status: 'no_action',
      required: false,
      kind: null,
      reason_code: 'hold',
      transfers: [],
    },
    context: {
      market: {
        id: '2026-05-18',
        regime: 'Neutral',
        raw_value: 50,
        confidence: 1,
      },
      signal: {
        id: '2026-05-18',
        regime: 'Neutral',
        raw_value: 50,
        confidence: 1,
      },
      portfolio: {
        spot_usd: 450,
        stable_usd: 550,
        total_value: 1000,
        allocation: { spot: 0.45, stable: 0.55 },
        asset_allocation: overrides?.current ?? {
          btc: 0.1,
          eth: 0.2,
          spy: 0.05,
          alt: 0.1,
          stable: 0.55,
        },
      },
      target: {
        allocation: overrides?.target ?? {
          btc: 0.25,
          eth: 0.15,
          spy: 0.1,
          alt: 0,
          stable: 0.5,
        },
      },
      strategy: {
        stance: 'hold',
        reason_code: 'hold',
        rule_group: 'none',
      },
    },
  };
}

describe('toCompositionTargetFromSuggestion', () => {
  it('converts daily-suggestion target ratios into percentage CompositionTarget', () => {
    const result = toCompositionTargetFromSuggestion(makeSuggestion());

    expect(result.target).toEqual({
      btc: 25,
      eth: 15,
      spy: 10,
      alt: 0,
      stable: 50,
      crypto: 50,
    });
  });

  it('calculates drift from current and target crypto percentages', () => {
    const result = toCompositionTargetFromSuggestion(
      makeSuggestion({
        current: {
          btc: 0.1,
          eth: 0.2,
          spy: 0.05,
          alt: 0.1,
          stable: 0.55,
        },
        target: {
          btc: 0.25,
          eth: 0.15,
          spy: 0.1,
          alt: 0.05,
          stable: 0.45,
        },
      }),
    );

    expect(result.target.crypto).toBe(55);
    expect(result.drift).toBe(10);
  });
});
