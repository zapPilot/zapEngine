import { describe, expect, it } from 'vitest';

import type { UsageCostLine } from './cost.js';
import {
  applyFishAudioPricing,
  fishAudioPriceUsdPerMillionUtf8Bytes,
} from './tts-pricing.js';

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

describe('Fish Audio pricing', () => {
  it('prices s2.1-pro-free at zero', () => {
    expect(fishAudioPriceUsdPerMillionUtf8Bytes('s2.1-pro-free')).toBe(0);
    expect(applyFishAudioPricing([fishLine('s2.1-pro-free')])[0]).toMatchObject({
      costUsd: 0,
      usage: { unitPriceUsd: 0 },
    });
  });

  it('keeps paid S2.1 Pro at $15 per million UTF-8 bytes', () => {
    expect(fishAudioPriceUsdPerMillionUtf8Bytes('s2.1-pro')).toBe(15);
    expect(applyFishAudioPricing([fishLine('s2.1-pro')])[0]?.costUsd).toBe(15);
  });

  it('defaults unknown Fish engines to the existing paid rate', () => {
    expect(fishAudioPriceUsdPerMillionUtf8Bytes('future-engine')).toBe(15);
  });
});
