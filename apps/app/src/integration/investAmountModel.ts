import { BASE_DEPOSIT_TOKENS } from '@/integration/depositTokens';

export type AmountUnit = 'USD' | 'Token';

/** Parse the grouped display amount (e.g. "1,000.50") to a number. */
export function parseAmount(grouped: string): number {
  const parsed = Number(grouped.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function groupWholeDigits(digits: string): string {
  const normalized = digits.replace(/^0+(?=\d)/, '') || '0';
  const groups: string[] = [];

  for (let end = normalized.length; end > 0; end -= 3) {
    groups.unshift(normalized.slice(Math.max(0, end - 3), end));
  }

  return groups.join(',');
}

/** Normalizes direct keyboard input into a grouped amount string. */
export function normalizeAmountInput(input: string): string {
  const cleaned = input.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (cleaned === '') {
    return '';
  }

  const [whole = '', ...fractionParts] = cleaned.split('.');
  const hasDecimal = cleaned.includes('.');
  const groupedWhole = groupWholeDigits(whole);

  if (!hasDecimal) {
    return groupedWhole;
  }

  return `${groupedWhole}.${fractionParts.join('')}`;
}

export function depositSupportLabel(
  tokens: readonly { symbol: string }[] = BASE_DEPOSIT_TOKENS,
): string {
  const supported = joinWithAnd(tokens.map((token) => `Base ${token.symbol}`));
  return `Deposit v1 supports ${supported}`;
}

export function amountUsdFromInput(
  groupedAmount: string,
  unit: AmountUnit,
  usdPrice: number | null,
): number | null {
  const value = parseAmount(groupedAmount);
  if (value <= 0) {
    return null;
  }
  if (unit === 'USD') {
    return value;
  }
  if (typeof usdPrice === 'number' && usdPrice > 0) {
    return value * usdPrice;
  }
  return null;
}
