/**
 * Data Validation and Type Conversion Utilities
 *
 * Provides safe type conversions with fallback values for untrusted data sources.
 *
 * @module lib/dataValidation
 */

/**
 * Safely converts value to number, returning undefined if invalid.
 * Handles string parsing, bigint conversion, and finite validation.
 *
 * @param value - Value to convert
 * @returns Number if valid and finite, undefined otherwise
 *
 * @example
 * safeNumber(123) // 123
 * safeNumber("45.67") // 45.67
 * safeNumber(BigInt(100)) // 100
 * safeNumber(NaN) // undefined
 * safeNumber(Infinity) // undefined
 * safeNumber(null) // undefined
 */
export function safeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (typeof value === 'bigint') {
    const converted = Number(value);
    return Number.isFinite(converted) ? converted : undefined;
  }

  return undefined;
}
