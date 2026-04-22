import { describe, expect, it } from 'vitest';

import {
  calculateDataFreshness,
  formatCurrency,
  formatNumber,
  formatRelativeTime,
} from '../../../src/utils/formatters';

describe('formatters', () => {
  describe('formatCurrency', () => {
    it.each([
      { amount: 1234.56, expected: '$1,234.56' },
      { amount: 0, expected: '$0.00' },
      { amount: 1_000_000, expected: '$1,000,000.00' },
    ])('formats $amount as $expected', ({ amount, expected }) => {
      expect(formatCurrency(amount)).toBe(expected);
    });

    it('returns the hidden placeholder when balances are hidden', () => {
      expect(formatCurrency(1234.56, true)).toBe('••••••••');
    });
  });

  describe('formatNumber', () => {
    it.each([
      { amount: 1234.56, expected: '1,234.56' },
      { amount: 0, expected: '0' },
      { amount: 1_000_000, expected: '1,000,000' },
      { amount: 1.123456, expected: '1.1235' },
      { amount: 1.1, expected: '1.1' },
    ])('formats $amount as $expected', ({ amount, expected }) => {
      expect(formatNumber(amount)).toBe(expected);
    });

    it('returns the hidden placeholder when numbers are hidden', () => {
      expect(formatNumber(1234.56, true)).toBe('••••');
    });
  });

  describe('data freshness helpers', () => {
    it('returns unknown freshness for invalid timestamps', () => {
      expect(calculateDataFreshness('not-a-date')).toEqual({
        relativeTime: 'Unknown',
        state: 'unknown',
        hoursSince: Infinity,
        timestamp: 'not-a-date',
        isCurrent: false,
      });
    });

    it('returns unknown relative time for missing timestamps', () => {
      expect(formatRelativeTime(null)).toBe('Unknown');
    });

    it('returns unknown freshness when the timestamp is missing', () => {
      expect(calculateDataFreshness(undefined)).toEqual({
        relativeTime: 'Unknown',
        state: 'unknown',
        hoursSince: Infinity,
        timestamp: '',
        isCurrent: false,
      });
    });
  });
});
