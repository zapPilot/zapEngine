import { describe, expect, it } from 'vitest';

import type { UsageCostLine } from './cost.js';
import { applyFishAudioPricing } from './tts-pricing.js';

function fishLine(model: string): UsageCostLine {
  return {
    category: 'tts',
    label: 'TTS main audio',
    provider: 'fish-audio',
    model,
    costUsd: 15,
    usage: {
      unit: 'utf8_bytes',
      quantity: 1_000_000,
      unitPriceUsd: 15 / 1_000_000,
    },
  };
}

describe('Fish Audio cost normalization', () => {
  it('keeps Fish usage but removes a fabricated provider-reported price', () => {
    expect(applyFishAudioPricing([fishLine('s2.1-pro-free')])[0]).toMatchObject({
      provider: 'fish-audio',
      model: 's2.1-pro-free',
      costUsd: 0,
      usage: {
        unit: 'utf8_bytes',
        quantity: 1_000_000,
        unitPriceUsd: 0,
      },
    });
  });

  it('does not turn an unreported paid Fish list price into provider cost either', () => {
    expect(applyFishAudioPricing([fishLine('s2.1-pro')])[0]?.costUsd).toBe(0);
  });

  it('leaves non-Fish cost lines untouched', () => {
    const line = { ...fishLine('example'), provider: 'other-provider' };
    expect(applyFishAudioPricing([line])[0]).toEqual(line);
  });
});
