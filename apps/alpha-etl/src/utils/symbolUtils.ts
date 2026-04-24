import { logger } from './logger.js';

function removeWrapChar(symbol: string): string {
  return symbol
    .toLowerCase()
    .replace(/[()[\]{}]/g, '')
    .replace(/\bbridged\b/gi, '')
    .replace(/\s+/g, '')
    .trim();
}

export interface SymbolParseLogContext {
  symbol?: string;
  originalParts?: number;
  uniqueParts?: number;
  actualParts?: number;
  expectedParts?: number;
}

export const chainNameMapping: Record<string, string> = {
  ethereum: 'ethereum',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  polygon: 'polygon',
  base: 'base',
  avalanche: 'avax',
  bsc: 'bsc',
  fantom: 'fantom',
  moonbeam: 'moonbeam',
  gnosis: 'xdai',
  aurora: 'aurora',
  celo: 'celo',
  harmony: 'harmony',
  cronos: 'cronos',
  metis: 'metis',
};

export function normalizeSymbolList(symbols: string[]): string[] {
  return symbols.map(removeWrapChar).sort();
}

export function checkSymbolListsEqual(
  list1: string[],
  list2: string[],
  strict = false,
): boolean {
  if (list1.length !== list2.length) {
    return false;
  }

  if (strict) {
    const normalized1 = list1.map(removeWrapChar);
    const normalized2 = list2.map(removeWrapChar);
    return normalized1.every((symbol, index) => symbol === normalized2[index]);
  }

  const normalized1 = normalizeSymbolList(list1);
  const normalized2 = normalizeSymbolList(list2);
  const set1 = new Set(normalized1);
  const set2 = new Set(normalized2);

  if (set1.size !== set2.size) {
    return false;
  }

  for (const symbol of set1) {
    if (!set2.has(symbol)) {
      return false;
    }
  }

  return true;
}

export function mapChainName(debankChain: string): string {
  const normalized = debankChain.toLowerCase();
  return chainNameMapping[normalized] ?? normalized;
}

export function parseSymbolsArray(
  symbol: string | null | undefined,
  underlyingTokens?: string[] | null,
): string[] | null {
  if (!symbol?.trim()) {
    return null;
  }

  const cleanSymbol = symbol.trim();
  const symbolParts = cleanSymbol
    .split('-')
    .filter((part) => part.trim().length > 0);

  if (!underlyingTokens?.length) {
    return symbolParts.length > 1 ? symbolParts : [cleanSymbol];
  }

  const expectedParts = underlyingTokens.length;

  if (symbolParts.length === expectedParts) {
    return symbolParts;
  }

  if (symbolParts.length > expectedParts) {
    const uniqueParts = [...new Set(symbolParts)];
    if (uniqueParts.length <= expectedParts) {
      logParseWarning('duplicates_removed', {
        symbol: cleanSymbol,
        originalParts: symbolParts.length,
        uniqueParts: uniqueParts.length,
        expectedParts,
      });
      return uniqueParts;
    }
  }

  if (symbolParts.length < expectedParts) {
    logParseWarning('hyphenated_tokens', {
      symbol: cleanSymbol,
      actualParts: symbolParts.length,
      expectedParts,
    });
  }

  return symbolParts;
}

export function cleanRewardTokens(
  tokens?: (string | null)[] | null,
): string[] | null {
  if (!tokens?.length) {
    return null;
  }

  const cleanTokens = tokens.filter(
    (token): token is string =>
      typeof token === 'string' && token.trim().length > 0,
  );

  return cleanTokens.length > 0 ? cleanTokens : null;
}

function logParseWarning(type: string, context: SymbolParseLogContext): void {
  logger.debug(`Symbol parsing: ${type}`, context);
}
