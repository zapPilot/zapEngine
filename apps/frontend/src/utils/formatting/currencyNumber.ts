import { PORTFOLIO_CONFIG } from "@/constants/portfolio";

import { type BaseFormatOptions, normalizeFormatOptions } from "./shared";

export interface CurrencyFormatOptions extends BaseFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  currency?: string;
  /** Threshold for smart precision mode (default: 0.01) */
  threshold?: number;
  /** Show negative values in smart precision mode */
  showNegative?: boolean;
}

export interface NumberFormatOptions extends BaseFormatOptions {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
}

const DEFAULT_CURRENCY_FORMAT_OPTIONS: CurrencyFormatOptions = {
  currency: PORTFOLIO_CONFIG.CURRENCY_CODE,
  locale: PORTFOLIO_CONFIG.CURRENCY_LOCALE,
  threshold: 0.01,
  showNegative: true,
};

const DEFAULT_NUMBER_FORMAT_OPTIONS: NumberFormatOptions = {
  locale: PORTFOLIO_CONFIG.CURRENCY_LOCALE,
  maximumFractionDigits: 4,
  minimumFractionDigits: 0,
};

function formatSmartCurrency(
  amount: number,
  threshold: number,
  showNegative: boolean,
  minDecimals: number
): string {
  if (amount === 0) {
    return "$0.00";
  }

  const absValue = Math.abs(amount);
  const isNegative = amount < 0 && showNegative;
  const prefix = isNegative ? "-" : "";

  if (absValue < threshold) {
    const thresholdDecimals = threshold < 0.01 ? 4 : 2;
    return `${prefix}< $${threshold.toFixed(thresholdDecimals)}`;
  }

  return `${prefix}$${absValue.toFixed(minDecimals)}`;
}

function formatSmartNumber(amount: number): string {
  if (amount === 0) return "0";
  if (amount < 0.000001) return "< 0.000001";
  if (amount < 0.01) return amount.toFixed(6);
  if (amount < 1) return amount.toFixed(4);
  if (amount < 100) return amount.toFixed(2);
  return amount.toFixed(0);
}

/**
 * Format a currency amount using app-level defaults.
 *
 * @param amount - Value to format
 * @param optionsOrIsHidden - Format options or legacy boolean hidden flag
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  optionsOrIsHidden: CurrencyFormatOptions | boolean = {}
): string {
  const options = normalizeFormatOptions(
    optionsOrIsHidden,
    DEFAULT_CURRENCY_FORMAT_OPTIONS
  );
  if (options.isHidden) {
    return PORTFOLIO_CONFIG.HIDDEN_BALANCE_PLACEHOLDER;
  }

  const maxDigits = options.maximumFractionDigits ?? 2;
  const minDigits = Math.min(options.minimumFractionDigits ?? 2, maxDigits);

  if (options.smartPrecision) {
    return formatSmartCurrency(
      amount,
      options.threshold ?? 0.01,
      options.showNegative ?? true,
      minDigits
    );
  }

  return new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency: options.currency,
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(amount);
}

/**
 * Format a plain number using app-level defaults.
 *
 * @param amount - Value to format
 * @param optionsOrIsHidden - Format options or legacy boolean hidden flag
 * @returns Formatted number string
 */
export function formatNumber(
  amount: number,
  optionsOrIsHidden: NumberFormatOptions | boolean = {}
): string {
  const options = normalizeFormatOptions(
    optionsOrIsHidden,
    DEFAULT_NUMBER_FORMAT_OPTIONS
  );
  if (options.isHidden) {
    return PORTFOLIO_CONFIG.HIDDEN_NUMBER_PLACEHOLDER;
  }

  if (options.smartPrecision) {
    return formatSmartNumber(amount);
  }

  return amount.toLocaleString(options.locale, {
    maximumFractionDigits: options.maximumFractionDigits,
    minimumFractionDigits: options.minimumFractionDigits,
  });
}
