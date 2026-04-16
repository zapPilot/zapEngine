import { vi } from "vitest";

/**
 * Centralized mock implementations for formatter functions.
 * Replaces duplicate mocks across 40+ test files.
 *
 * @module tests/mocks/formatters
 *
 * @example
 * ```typescript
 * import { mockFormatters } from 'tests/mocks/formatters';
 *
 * vi.mock('@/utils/formatters', () => mockFormatters);
 *
 * describe('MyComponent', () => {
 *   it('formats currency', () => {
 *     mockFormatters.formatCurrency(1234.56);
 *     expect(mockFormatters.formatCurrency).toHaveBeenCalledWith(1234.56);
 *   });
 * });
 * ```
 */
export const mockFormatters = {
  /**
   * Mock implementation of formatCurrency.
   * Supports both legacy boolean parameter and options object.
   */
  formatCurrency: vi.fn((amount: number, options: any = {}) => {
    const isHidden =
      typeof options === "boolean" ? options : options.isHidden || false;
    if (isHidden) return "****";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }),

  /**
   * Mock implementation of formatNumber.
   * Supports both legacy boolean parameter and options object.
   */
  formatNumber: vi.fn((amount: number, options: any = {}) => {
    const isHidden =
      typeof options === "boolean" ? options : options.isHidden || false;
    if (isHidden) return "***";
    return amount.toLocaleString("en-US", {
      maximumFractionDigits: options.maximumFractionDigits || 4,
      minimumFractionDigits: options.minimumFractionDigits || 0,
    });
  }),

  /**
   * Mock implementation of formatTokenAmount.
   */
  formatTokenAmount: vi.fn((amount: number, symbol: string, decimals = 4) => {
    if (amount === 0) return `0 ${symbol}`;
    if (amount < 0.0001) return `< 0.0001 ${symbol}`;
    return `${amount.toFixed(decimals)} ${symbol}`;
  }),

  /**
   * Mock implementation of formatAddress.
   * Shortens wallet addresses to standard format.
   */
  formatAddress: vi.fn((address?: string | null, options: any = {}) => {
    if (!address || typeof address !== "string") return "";

    const normalized = address.trim();
    if (normalized.length === 0) return "";

    const prefixLength = options.prefixLength || 6;
    const suffixLength = options.suffixLength || 4;
    const ellipsis = options.ellipsis || "...";

    if (normalized.length <= prefixLength + suffixLength) {
      return normalized;
    }

    return `${normalized.slice(0, prefixLength)}${ellipsis}${normalized.slice(-suffixLength)}`;
  }),

  /**
   * Mock implementation of formatChartDate.
   */
  formatChartDate: vi.fn((date: string | Date) => {
    const parsed = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(parsed.getTime())) {
      return typeof date === "string" ? date : "";
    }
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }),

  /**
   * Mock implementation of formatLargeNumber.
   */
  formatLargeNumber: vi.fn((value: number, decimals = 1) => {
    if (value === 0) return "0";

    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";

    if (absValue >= 1e9) {
      return `${sign}${(absValue / 1e9).toFixed(decimals)}B`;
    }
    if (absValue >= 1e6) {
      return `${sign}${(absValue / 1e6).toFixed(decimals)}M`;
    }
    if (absValue >= 1e3) {
      return `${sign}${(absValue / 1e3).toFixed(decimals)}K`;
    }

    return value.toString();
  }),

  /**
   * Mock implementation of the formatters object.
   */
  formatters: {
    currency: vi.fn((value: number) =>
      mockFormatters.formatCurrency(Math.round(value))
    ),
    currencyPrecise: vi.fn((value: number) =>
      mockFormatters.formatCurrency(value, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    ),
    percent: vi.fn(
      (value: number, decimals = 1) => `${value.toFixed(decimals)}%`
    ),
    chartDate: vi.fn((date: string | Date) =>
      mockFormatters.formatChartDate(date)
    ),
    number: vi.fn((amount: number) => mockFormatters.formatNumber(amount)),
  },

  // Legacy exports for backward compatibility
  formatCurrencyValue: vi.fn((amount: number, options: any = {}) =>
    mockFormatters.formatCurrency(amount, options)
  ),
  formatNumericValue: vi.fn((amount: number, options: any = {}) =>
    mockFormatters.formatNumber(amount, options)
  ),
};

/**
 * Helper function to reset all formatter mocks.
 * Use in beforeEach or afterEach hooks.
 *
 * @example
 * ```typescript
 * import { mockFormatters, resetFormatterMocks } from 'tests/mocks/formatters';
 *
 * describe('MyComponent', () => {
 *   beforeEach(() => {
 *     resetFormatterMocks();
 *   });
 * });
 * ```
 */
export function resetFormatterMocks() {
  for (const mock of Object.values(mockFormatters)) {
    if (typeof mock === "function" && "mockClear" in mock) {
      mock.mockClear();
    } else if (typeof mock === "object") {
      for (const nestedMock of Object.values(mock)) {
        if (typeof nestedMock === "function" && "mockClear" in nestedMock) {
          nestedMock.mockClear();
        }
      }
    }
  }
}
