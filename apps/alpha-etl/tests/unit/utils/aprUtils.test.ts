/**
 * Unit tests for APR/APY conversion utilities
 * Tests financial calculations with precision requirements
 */

import { describe, it, expect } from 'vitest';
import {
  convertDailyCompoundedApyToApr,
  validateApr,
  validateApy,
  normalizePercentage,
} from '../../../src/utils/aprUtils.js';
import {
  dailyCompoundedApyToAprTestCases,
} from '../../fixtures/poolData.js';
import { expectToBeCloseTo } from '../../utils/testHelpers.js';

describe('APR/APY Conversion Utils', () => {
  describe('convertDailyCompoundedApyToApr', () => {
    it.each(dailyCompoundedApyToAprTestCases)(
      'should convert $description',
      ({ input, expected, tolerance }) => {
        const result = convertDailyCompoundedApyToApr(input);
        expectToBeCloseTo(result, expected, tolerance);
      }
    );

    it('should return 0 for zero APY', () => {
      expect(convertDailyCompoundedApyToApr(0)).toBe(0);
    });

    it('should return 0 for negative APY', () => {
      expect(convertDailyCompoundedApyToApr(-0.1)).toBe(0);
    });

    it('should handle realistic DeFi yields correctly', () => {
      // Test common DeFi APY values
      const testCases = [
        { apy: 0.03, expectedAprRange: [0.029, 0.031] }, // ~3% APY
        { apy: 0.15, expectedAprRange: [0.139, 0.141] }, // ~15% APY -> ~13.98% APR
        { apy: 0.50, expectedAprRange: [0.40, 0.45] }, // ~50% APY
      ];

      testCases.forEach(({ apy, expectedAprRange }) => {
        const result = convertDailyCompoundedApyToApr(apy);
        expect(result).toBeGreaterThanOrEqual(expectedAprRange[0]);
        expect(result).toBeLessThanOrEqual(expectedAprRange[1]);
      });
    });
  });

  describe('validateApr', () => {
    it('should return true for valid APR values', () => {
      expect(validateApr(0)).toBe(true);
      expect(validateApr(0.05)).toBe(true);
      expect(validateApr(0.1)).toBe(true);
      expect(validateApr(1)).toBe(true); // 100% APR
      expect(validateApr(5)).toBe(true); // 500% APR
    });

    it('should return false for invalid APR values', () => {
      expect(validateApr(-0.05)).toBe(false); // Negative
      expect(validateApr(NaN)).toBe(false); // NaN
      expect(validateApr(Infinity)).toBe(false); // Infinity
      expect(validateApr(15)).toBe(false); // Too high (>1000%)
      expect(validateApr('0.05' as unknown)).toBe(false); // String
    });

    it('should handle edge cases correctly', () => {
      expect(validateApr(0.0001)).toBe(true); // Very small
      expect(validateApr(10)).toBe(true); // At upper bound (1000%)
      expect(validateApr(10.1)).toBe(false); // Just above upper bound
    });
  });

  describe('validateApy', () => {
    it('should return true for valid APY values', () => {
      expect(validateApy(0)).toBe(true);
      expect(validateApy(0.05)).toBe(true);
      expect(validateApy(0.1)).toBe(true);
      expect(validateApy(-0.05)).toBe(true); // Negative APY can be valid in some contexts
      expect(validateApy(100)).toBe(true); // High APY
    });

    it('should return false for invalid APY values', () => {
      expect(validateApy(NaN)).toBe(false); // NaN
      expect(validateApy(Infinity)).toBe(false); // Infinity
      expect(validateApy(-Infinity)).toBe(false); // Negative Infinity
      expect(validateApy('0.05' as unknown)).toBe(false); // String
    });
  });

  describe('normalizePercentage', () => {
    it('should convert percentage to decimal by default', () => {
      expect(normalizePercentage(5)).toBe(0.05);
      expect(normalizePercentage(100)).toBe(1);
      expect(normalizePercentage(0)).toBe(0);
      expect(normalizePercentage(25.5)).toBe(0.255);
    });

    it('should return decimal value when isDecimal is true', () => {
      expect(normalizePercentage(0.05, true)).toBe(0.05);
      expect(normalizePercentage(1, true)).toBe(1);
      expect(normalizePercentage(0, true)).toBe(0);
    });

    it('should handle negative values correctly', () => {
      expect(normalizePercentage(-5)).toBe(-0.05);
      expect(normalizePercentage(-0.05, true)).toBe(-0.05);
    });
  });
});
