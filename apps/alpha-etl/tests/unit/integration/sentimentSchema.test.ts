/**
 * Integration test for sentiment schema with new utilities
 */

import { describe, it, expect } from 'vitest';
import { SentimentDataSchema } from '../../../src/modules/sentiment/schema.js';

describe('SentimentDataSchema Integration', () => {
  it('should validate and normalize sentiment data correctly', () => {
    const testData = {
      value: 25,
      classification: 'EXTREME FEAR',
      timestamp: Date.now(),
      source: 'coinmarketcap'
    };

    const result = SentimentDataSchema.parse(testData);

    expect(result.classification).toBe('Extreme Fear');
    expect(result.value).toBe(25);
    expect(result.source).toBe('coinmarketcap');
  });

  it('should handle different case variations', () => {
    const testCases = [
      { input: 'extreme fear', expected: 'Extreme Fear' },
      { input: 'FEAR', expected: 'Fear' },
      { input: '  neutral  ', expected: 'Neutral' },
      { input: 'GREED', expected: 'Greed' },
      { input: 'extreme greed', expected: 'Extreme Greed' }
    ];

    for (const { input, expected } of testCases) {
      const testData = {
        value: 50,
        classification: input,
        timestamp: Date.now(),
        source: 'test'
      };

      const result = SentimentDataSchema.parse(testData);
      expect(result.classification).toBe(expected);
    }
  });

  it('should reject invalid classifications', () => {
    const testData = {
      value: 50,
      classification: 'invalid classification',
      timestamp: Date.now(),
      source: 'test'
    };

    expect(() => SentimentDataSchema.parse(testData)).toThrow();
  });

  it('should preserve invalid classification if no match found for pipe validation', () => {
    // This tests that our transform preserves original value for the pipe validation to handle
    const testData = {
      value: 50,
      classification: 'invalid',
      timestamp: Date.now(),
      source: 'test'
    };

    expect(() => SentimentDataSchema.parse(testData)).toThrow('Invalid classification value');
  });
});
