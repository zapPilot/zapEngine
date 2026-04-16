import { describe, it, expect } from 'vitest';
import { generateDateRange, calculateMissingDates, formatDateToYYYYMMDD } from '../../../src/utils/dateUtils.js';

function createDateRange(start: string, end: string): Date[] {
  return generateDateRange(new Date(start), new Date(end));
}

describe('dateUtils', () => {
  describe('generateDateRange', () => {
    it('should generate single day range', () => {
      const start = new Date('2024-12-25');
      const end = new Date('2024-12-25');
      const result = generateDateRange(start, end);
      expect(result).toHaveLength(1);
    });

    it('should generate 30-day range', () => {
      const start = new Date('2024-12-01');
      const end = new Date('2024-12-30');
      const result = generateDateRange(start, end);
      expect(result).toHaveLength(30);
    });

    it('should handle month boundaries', () => {
      const start = new Date('2024-11-28');
      const end = new Date('2024-12-02');
      const result = generateDateRange(start, end);
      expect(result).toHaveLength(5);
    });

    it('should normalize to midnight UTC', () => {
      const start = new Date('2024-12-25T15:30:00Z');
      const end = new Date('2024-12-25T20:45:00Z');
      const result = generateDateRange(start, end);
      expect(result).toHaveLength(1);
      expect(result[0].getUTCHours()).toBe(0);
    });
  });

  describe('calculateMissingDates', () => {
    it('should return all dates when no existing dates', () => {
      const allDates = createDateRange('2024-12-01', '2024-12-03');
      const existing: string[] = [];
      const missing = calculateMissingDates(allDates, existing);
      expect(missing).toHaveLength(3);
    });

    it('should return empty array when all dates exist', () => {
      const allDates = createDateRange('2024-12-01', '2024-12-03');
      const existing = ['2024-12-01', '2024-12-02', '2024-12-03'];
      const missing = calculateMissingDates(allDates, existing);
      expect(missing).toHaveLength(0);
    });

    it('should identify gaps in middle of range', () => {
      const allDates = createDateRange('2024-12-01', '2024-12-05');
      const existing = ['2024-12-01', '2024-12-03', '2024-12-05'];
      const missing = calculateMissingDates(allDates, existing);
      expect(missing).toHaveLength(2);
      expect(formatDateToYYYYMMDD(missing[0])).toBe('2024-12-02');
      expect(formatDateToYYYYMMDD(missing[1])).toBe('2024-12-04');
    });
  });

  describe('formatDateToYYYYMMDD', () => {
    it('should format date correctly', () => {
      const date = new Date('2024-12-25T10:30:00Z');
      expect(formatDateToYYYYMMDD(date)).toBe('2024-12-25');
    });

    it('should handle single-digit months and days', () => {
      const date = new Date('2024-01-05T00:00:00Z');
      expect(formatDateToYYYYMMDD(date)).toBe('2024-01-05');
    });
  });
});
