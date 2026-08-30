import type { UsageCostLine } from './cost.js';

const FISH_AUDIO_USD_PER_MILLION_UTF8_BYTES: Record<string, number> = {
  // Fish advertises this model as developer-free. Keep the model key explicit
  // so switching to the paid engine cannot silently inherit a zero price.
  's2.1-pro-free': 0,
  's2.1-pro': 15,
};
const DEFAULT_FISH_AUDIO_USD_PER_MILLION_UTF8_BYTES = 15;

export function fishAudioPriceUsdPerMillionUtf8Bytes(model: string): number {
  return (
    FISH_AUDIO_USD_PER_MILLION_UTF8_BYTES[model] ??
    DEFAULT_FISH_AUDIO_USD_PER_MILLION_UTF8_BYTES
  );
}

export function applyFishAudioPricing(lines: UsageCostLine[]): UsageCostLine[] {
  return lines.map((line) => {
    if (line.provider !== 'fish-audio' || line.usage?.unit !== 'utf8_bytes') {
      return line;
    }

    const pricePerMillion = fishAudioPriceUsdPerMillionUtf8Bytes(line.model);
    const unitPriceUsd = pricePerMillion / 1_000_000;
    return {
      ...line,
      costUsd: line.usage.quantity * unitPriceUsd,
      usage: {
        ...line.usage,
        unitPriceUsd,
      },
    };
  });
}
