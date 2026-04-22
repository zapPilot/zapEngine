import {
  formatChartAxisDate,
  formatCurrencyAxis,
  formatSentiment,
} from '@/utils';

describe('chart axis formatters', () => {
  describe('formatChartAxisDate', () => {
    it('should format date string to short month and 2-digit year', () => {
      const result = formatChartAxisDate('2024-01-15');
      expect(result).toMatch(/Jan.*24/);
    });

    it('should format timestamp number to short month and 2-digit year', () => {
      const timestamp = new Date('2024-06-15').getTime();
      const result = formatChartAxisDate(timestamp);
      expect(result).toMatch(/Jun.*24/);
    });

    it('should handle epoch timestamp', () => {
      const result = formatChartAxisDate(0);
      expect(result).toMatch(/Jan|Dec/); // Epoch is either Jan 1970 or Dec 1969 depending on timezone
    });

    it('should handle numeric string timestamp', () => {
      const timestamp = new Date('2024-12-31').getTime();
      const result = formatChartAxisDate(timestamp);
      expect(result).toMatch(/Dec.*24/);
    });

    it('should handle various date formats', () => {
      const isoDate = formatChartAxisDate('2024-03-15T10:30:00Z');
      expect(isoDate).toMatch(/Mar.*24/);

      const shortDate = formatChartAxisDate('2024-07-04');
      expect(shortDate).toMatch(/Jul.*24/);
    });
  });

  describe('formatCurrencyAxis', () => {
    it('should format numeric value to thousands with k suffix', () => {
      expect(formatCurrencyAxis(50000)).toBe('$50k');
    });

    it('should format string numeric value', () => {
      expect(formatCurrencyAxis('75000')).toBe('$75k');
    });

    it('should round down decimal thousands', () => {
      expect(formatCurrencyAxis(45678)).toBe('$46k');
    });

    it('should handle zero value', () => {
      expect(formatCurrencyAxis(0)).toBe('$0k');
    });

    it('should handle small values less than 1000', () => {
      expect(formatCurrencyAxis(500)).toBe('$1k');
      expect(formatCurrencyAxis(999)).toBe('$1k');
    });

    it('should handle negative values', () => {
      expect(formatCurrencyAxis(-25000)).toBe('$-25k');
    });

    it('should handle large values', () => {
      expect(formatCurrencyAxis(1500000)).toBe('$1500k');
    });

    it('should handle decimal string values', () => {
      expect(formatCurrencyAxis('123456.789')).toBe('$123k');
    });

    it('should handle values close to rounding boundary', () => {
      expect(formatCurrencyAxis(49499)).toBe('$49k');
      expect(formatCurrencyAxis(49500)).toBe('$50k');
    });
  });

  describe('formatSentiment', () => {
    it('should return Fear for value 0', () => {
      expect(formatSentiment(0)).toBe('Fear');
    });

    it('should return Neutral for value 50', () => {
      expect(formatSentiment(50)).toBe('Neutral');
    });

    it('should return Greed for value 100', () => {
      expect(formatSentiment(100)).toBe('Greed');
    });

    it('should return string representation for values between 0 and 50', () => {
      expect(formatSentiment(25)).toBe('25');
      expect(formatSentiment(1)).toBe('1');
      expect(formatSentiment(49)).toBe('49');
    });

    it('should return string representation for values between 50 and 100', () => {
      expect(formatSentiment(75)).toBe('75');
      expect(formatSentiment(51)).toBe('51');
      expect(formatSentiment(99)).toBe('99');
    });

    it('should handle negative values', () => {
      expect(formatSentiment(-10)).toBe('-10');
    });

    it('should handle values greater than 100', () => {
      expect(formatSentiment(150)).toBe('150');
    });

    it('should handle decimal values', () => {
      expect(formatSentiment(25.5)).toBe('25.5');
    });
  });
});
