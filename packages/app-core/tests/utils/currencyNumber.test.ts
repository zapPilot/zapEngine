import {
  formatCurrency,
  formatNumber,
} from '@core/utils/formatting/currencyNumber';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('formatCurrency', () => {
  it('formats with app defaults and honours explicit fraction digits', () => {
    expect(formatCurrency(1_234.5)).toBe('$1,234.50');
    expect(formatCurrency(-1_234.5)).toBe('-$1,234.50');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(
      formatCurrency(39_820, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    ).toBe('$39,820');
    expect(
      formatCurrency(1_234.567_8, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      }),
    ).toBe('$1,234.5678');
  });

  it('clamps the minimum to the maximum instead of throwing', () => {
    expect(formatCurrency(9.876, { maximumFractionDigits: 1 })).toBe('$9.9');
  });

  it('honours the currency and locale it is given', () => {
    expect(formatCurrency(1_234.5, { currency: 'EUR', locale: 'de-DE' })).toBe(
      // ICU separates the amount from the symbol with U+00A0.
      '1.234,50\u00a0€',
    );
  });

  it('returns the hidden placeholder for both option shapes', () => {
    expect(formatCurrency(1_234.5, true)).toBe('••••••••');
    expect(formatCurrency(1_234.5, { isHidden: true })).toBe('••••••••');
  });

  it('keeps the smart-precision ladder', () => {
    const smart = { smartPrecision: true } as const;
    expect(formatCurrency(0, smart)).toBe('$0.00');
    expect(formatCurrency(0.004, smart)).toBe('< $0.01');
    expect(formatCurrency(-0.004, smart)).toBe('-< $0.01');
    expect(formatCurrency(-0.004, { ...smart, showNegative: false })).toBe(
      '< $0.01',
    );
    expect(formatCurrency(0.000_04, { ...smart, threshold: 0.0001 })).toBe(
      '< $0.0001',
    );
    expect(formatCurrency(-1_234.5, smart)).toBe('-$1234.50');
    expect(
      formatCurrency(1_234.5, { ...smart, minimumFractionDigits: 0 }),
    ).toBe('$1235');
  });
});

describe('formatNumber', () => {
  it('formats with app defaults and the hidden placeholder', () => {
    expect(formatNumber(1_234.567_89)).toBe('1,234.5679');
    expect(formatNumber(1_234.5, { maximumFractionDigits: 1 })).toBe('1,234.5');
    expect(formatNumber(1_234.5, true)).toBe('••••');
  });

  it('keeps the smart-precision ladder', () => {
    const smart = { smartPrecision: true } as const;
    expect(formatNumber(0, smart)).toBe('0');
    expect(formatNumber(0.000_000_5, smart)).toBe('< 0.000001');
    expect(formatNumber(0.005, smart)).toBe('0.005000');
    expect(formatNumber(0.5, smart)).toBe('0.5000');
    expect(formatNumber(50.555, smart)).toBe('50.55');
    expect(formatNumber(1_234.5, smart)).toBe('1235');
  });
});

const OriginalNumberFormat = Intl.NumberFormat;

/**
 * `new` reaches the mock's implementation directly, and an arrow function is
 * not constructible — hence a declaration that forwards to the real
 * constructor captured above.
 */
function constructNumberFormat(
  ...args: ConstructorParameters<typeof Intl.NumberFormat>
): Intl.NumberFormat {
  return new OriginalNumberFormat(...args);
}

function spyOnNumberFormat() {
  return vi
    .spyOn(Intl, 'NumberFormat')
    .mockImplementation(constructNumberFormat);
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The cache lives at module scope and the cases above have already warmed the
 * app-default entry, so every assertion below uses a currency no other case in
 * this file touches.
 */
describe('formatCurrency formatter cache', () => {
  it('builds one formatter for repeated identical parameters', () => {
    const construct = spyOnNumberFormat();
    const options = {
      currency: 'JPY',
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    };

    const outputs = [1, 2, 3].map((value) => formatCurrency(value, options));

    expect(construct).toHaveBeenCalledTimes(1);
    expect(outputs).toEqual(['¥1.000', '¥2.000', '¥3.000']);
  });

  it('builds a separate formatter for a different currency', () => {
    const construct = spyOnNumberFormat();
    const digits = { minimumFractionDigits: 3, maximumFractionDigits: 3 };

    // JPY is already cached by the case above, so only GBP is constructed.
    formatCurrency(1, { ...digits, currency: 'JPY' });
    formatCurrency(1, { ...digits, currency: 'GBP' });

    expect(construct).toHaveBeenCalledTimes(1);
  });

  it('builds a separate formatter for different fraction digits', () => {
    const construct = spyOnNumberFormat();

    // The exact regression the cache key exists to prevent: `formatUsd(x, 0)`
    // and `formatUsd(x, 2)` agree on locale and currency and differ only here.
    const zero = formatCurrency(39_820, {
      currency: 'CHF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    const two = formatCurrency(39_820, {
      currency: 'CHF',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    expect(construct).toHaveBeenCalledTimes(2);
    // ICU separates the code from the amount with U+00A0.
    expect(zero).toBe('CHF\u00a039,820');
    expect(two).toBe('CHF\u00a039,820.00');
  });
});
