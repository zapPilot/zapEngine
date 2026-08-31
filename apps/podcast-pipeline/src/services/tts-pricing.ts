import type { UsageCostLine } from './cost.js';

/**
 * Fish returns usage, not the exact amount billed for an individual TTS call.
 * Do not pretend the public list price is provider-reported cost here.
 *
 * The durable pipeline ledger prices these UTF-8 bytes from versioned
 * `ops.cost_rates` rows. Keeping the immediate ingest summary at zero is
 * deliberate: it only shows costs the provider actually reported, while the
 * Control Center remains the source of truth for estimated Fish spend.
 */
export function applyFishAudioPricing(lines: UsageCostLine[]): UsageCostLine[] {
  return lines.map((line) => {
    if (line.provider !== 'fish-audio' || line.usage?.unit !== 'utf8_bytes') {
      return line;
    }

    return {
      ...line,
      costUsd: 0,
      usage: {
        ...line.usage,
        unitPriceUsd: 0,
      },
    };
  });
}
