import type { BridgeProvider } from './bridge-provider.js';
import type {
  BridgeQuote,
  BridgeQuoteRequest,
  BridgeSelection,
} from './bridge.types.js';

const ECO_TIE_BREAK_USD = 0.01;
const USDC_DECIMALS = 6;

export class BridgeQuoteUnavailableError extends Error {
  constructor(
    readonly failures: ReadonlyArray<{ provider: string; error: unknown }>,
  ) {
    super('No bridge provider could produce a quote');
    this.name = 'BridgeQuoteUnavailableError';
  }
}

function decimalToMicros(value: string): bigint {
  const [whole = '0', fraction = ''] = value.trim().split('.');
  const sign = whole.startsWith('-') ? -1n : 1n;
  const normalizedWhole = whole.replace('-', '') || '0';
  const normalizedFraction = fraction
    .padEnd(USDC_DECIMALS, '0')
    .slice(0, USDC_DECIMALS);
  return (
    sign * (BigInt(normalizedWhole) * 1_000_000n + BigInt(normalizedFraction))
  );
}

function effectiveValueMicros(quote: BridgeQuote): bigint {
  // Canonical routes are USDC -> USDC, so destination base units can be
  // compared directly to source-chain gas expressed in USD.
  return BigInt(quote.toAmount) - decimalToMicros(quote.gasUsd);
}

function compareQuotes(a: BridgeQuote, b: BridgeQuote): number {
  const delta = effectiveValueMicros(a) - effectiveValueMicros(b);
  const tie = 10_000n; // $0.01 in 6-decimal USDC base units.
  if (delta > tie) return -1;
  if (delta < -tie) return 1;

  if (a.provider === 'eco' && b.provider !== 'eco') return -1;
  if (b.provider === 'eco' && a.provider !== 'eco') return 1;

  return a.estimatedDurationSec - b.estimatedDurationSec;
}

export class BridgeRouter {
  constructor(private readonly providers: readonly BridgeProvider[]) {}

  async quote(request: BridgeQuoteRequest): Promise<BridgeSelection> {
    const support = await Promise.all(
      this.providers.map(async (provider) => ({
        provider,
        supported: await provider.supports(request),
      })),
    );
    const candidates = support.filter((entry) => entry.supported);
    if (candidates.length === 0) {
      throw new BridgeQuoteUnavailableError([]);
    }

    const results = await Promise.allSettled(
      candidates.map(({ provider }) => provider.quote(request)),
    );
    const quotes: BridgeQuote[] = [];
    const failures: Array<{ provider: string; error: unknown }> = [];

    results.forEach((result, index) => {
      const provider = candidates[index]!.provider;
      if (result.status === 'fulfilled') {
        quotes.push(result.value);
      } else {
        failures.push({ provider: provider.id, error: result.reason });
      }
    });

    if (quotes.length === 0) {
      throw new BridgeQuoteUnavailableError(failures);
    }

    const ranked = [...quotes].sort(compareQuotes);
    return {
      selected: ranked[0]!,
      alternatives: ranked.slice(1),
    };
  }

  getProvider(id: BridgeQuote['provider']): BridgeProvider {
    const provider = this.providers.find((candidate) => candidate.id === id);
    if (!provider) {
      throw new Error(`Bridge provider ${id} is not configured`);
    }
    return provider;
  }
}

export { ECO_TIE_BREAK_USD };
