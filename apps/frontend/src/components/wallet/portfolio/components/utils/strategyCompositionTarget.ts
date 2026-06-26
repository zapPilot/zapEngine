import { calculateDelta } from '@zapengine/app-core/adapters/portfolio/allocationAdapter';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';

export interface CompositionTarget {
  crypto: number;
  stable: number;
  btc?: number;
  eth?: number;
  spy?: number;
  alt?: number;
}

type AssetAllocation =
  DailySuggestionResponse['context']['target']['allocation'];

function toPercent(ratio: number): number {
  return Number((ratio * 100).toFixed(10));
}

function getCryptoPercent(allocation: AssetAllocation): number {
  return toPercent(
    allocation.btc + allocation.eth + allocation.spy + allocation.alt,
  );
}

export function toCompositionTargetFromSuggestion(
  suggestion: DailySuggestionResponse,
): { target: CompositionTarget; drift: number } {
  const targetAllocation = suggestion.context.target.allocation;
  const currentAllocation = suggestion.context.portfolio.asset_allocation;
  const targetCrypto = getCryptoPercent(targetAllocation);
  const currentCrypto = getCryptoPercent(currentAllocation);

  return {
    target: {
      btc: toPercent(targetAllocation.btc),
      eth: toPercent(targetAllocation.eth),
      spy: toPercent(targetAllocation.spy),
      alt: toPercent(targetAllocation.alt),
      stable: toPercent(targetAllocation.stable),
      crypto: targetCrypto,
    },
    drift: calculateDelta(currentCrypto, targetCrypto),
  };
}
