/**
 * Tests for sentiment utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeSentimentClassification,
  isValidSentimentClassification
} from '../../../src/utils/sentimentUtils.js';

describe('Sentiment Utils', () => {
  describe('normalizeSentimentClassification', () => {
    it('should normalize sentiment classifications to exact enum values', () => {
      expect(normalizeSentimentClassification('EXTREME FEAR')).toBe('Extreme Fear');
      expect(normalizeSentimentClassification('extreme fear')).toBe('Extreme Fear');
      expect(normalizeSentimentClassification('  extreme fear  ')).toBe('Extreme Fear');
      expect(normalizeSentimentClassification('FEAR')).toBe('Fear');
      expect(normalizeSentimentClassification('neutral')).toBe('Neutral');
      expect(normalizeSentimentClassification('Greed')).toBe('Greed');
      expect(normalizeSentimentClassification('EXTREME GREED')).toBe('Extreme Greed');
    });

    it('should return original input if no valid match found', () => {
      expect(normalizeSentimentClassification('invalid')).toBe('invalid');
      expect(normalizeSentimentClassification('not found')).toBe('not found');
      expect(normalizeSentimentClassification('')).toBe('');
    });

    it('should handle exact matches correctly', () => {
      expect(normalizeSentimentClassification('Extreme Fear')).toBe('Extreme Fear');
      expect(normalizeSentimentClassification('Neutral')).toBe('Neutral');
      expect(normalizeSentimentClassification('Extreme Greed')).toBe('Extreme Greed');
    });

    it('should handle edge cases', () => {
      expect(normalizeSentimentClassification('  Extreme  Fear  ')).toBe('  Extreme  Fear  ');
      expect(normalizeSentimentClassification('extreme-fear')).toBe('extreme-fear');
      expect(normalizeSentimentClassification('EXTREME_FEAR')).toBe('EXTREME_FEAR');
    });
  });

  describe('isValidSentimentClassification', () => {
    it('should validate correct sentiment classifications', () => {
      expect(isValidSentimentClassification('extreme fear')).toBe(true);
      expect(isValidSentimentClassification('EXTREME FEAR')).toBe(true);
      expect(isValidSentimentClassification('Extreme Fear')).toBe(true);
      expect(isValidSentimentClassification('  fear  ')).toBe(true);
      expect(isValidSentimentClassification('neutral')).toBe(true);
      expect(isValidSentimentClassification('GREED')).toBe(true);
      expect(isValidSentimentClassification('Extreme Greed')).toBe(true);
    });

    it('should reject invalid sentiment classifications', () => {
      expect(isValidSentimentClassification('invalid')).toBe(false);
      expect(isValidSentimentClassification('not found')).toBe(false);
      expect(isValidSentimentClassification('')).toBe(false);
      expect(isValidSentimentClassification('extreme-fear')).toBe(false);
      expect(isValidSentimentClassification('EXTREME_FEAR')).toBe(false);
    });

    it('should be case-insensitive and ignore whitespace', () => {
      expect(isValidSentimentClassification('  NEUTRAL  ')).toBe(true);
      expect(isValidSentimentClassification('\tFEAR\n')).toBe(true);
      expect(isValidSentimentClassification('  greed  ')).toBe(true);
    });
  });
});
