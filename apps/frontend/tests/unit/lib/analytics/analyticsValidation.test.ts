import { validateExportData } from '@zapengine/app-core/lib/analytics/analyticsValidation';
import type { AnalyticsData } from '@zapengine/app-core/types/analytics';
import { describe, expect, it } from 'vitest';

function createValidAnalyticsData(): AnalyticsData {
  return {
    performanceChart: {
      points: [
        { x: 0, portfolio: 0, date: '2024-01-01', portfolioValue: 10000 },
        { x: 100, portfolio: 100, date: '2024-12-31', portfolioValue: 15000 },
      ],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    },
    drawdownChart: {
      points: [{ x: 0, value: 0, date: '2024-01-01' }],
      maxDrawdown: -10.5,
      maxDrawdownDate: '2024-06-01',
    },
    keyMetrics: {
      timeWeightedReturn: {
        value: '+24.5%',
        subValue: '+5% vs BTC',
        trend: 'up',
      },
      maxDrawdown: { value: '-10.5%', subValue: 'Worst month', trend: 'down' },
      sharpe: { value: '1.85', subValue: 'Excellent', trend: 'up' },
      winRate: { value: '68%', subValue: 'Top 30%', trend: 'up' },
      volatility: { value: '12.3%', subValue: 'Moderate', trend: 'neutral' },
    },
    monthlyPnL: [
      { month: 'Jan', year: 2024, value: 5.2 },
      { month: 'Dec', year: 2024, value: 3.1 },
    ],
  };
}

describe('analyticsValidation', () => {
  describe('validateExportData', () => {
    it('should return true for valid analytics data', () => {
      const data = createValidAnalyticsData();
      expect(validateExportData(data)).toBe(true);
    });

    it('should return false for null data', () => {
      expect(validateExportData(null)).toBe(false);
    });

    it('should return false when performanceChart is missing', () => {
      const data = createValidAnalyticsData();
      data.performanceChart = undefined as never;
      expect(validateExportData(data)).toBe(false);
    });

    it('should return false when performanceChart.points is empty', () => {
      const data = createValidAnalyticsData();
      data.performanceChart.points = [];
      expect(validateExportData(data)).toBe(false);
    });

    it('should return false when performanceChart.points is missing', () => {
      const data = createValidAnalyticsData();
      data.performanceChart = {
        ...data.performanceChart,
        points: undefined as never,
      } as never;
      expect(validateExportData(data)).toBe(false);
    });

    it('should return false when drawdownChart is missing', () => {
      const data = createValidAnalyticsData();
      data.drawdownChart = undefined as never;
      expect(validateExportData(data)).toBe(false);
    });

    it('should return false when drawdownChart.points is empty', () => {
      const data = createValidAnalyticsData();
      data.drawdownChart.points = [];
      expect(validateExportData(data)).toBe(false);
    });

    it('should return false when keyMetrics is missing', () => {
      const data = createValidAnalyticsData();
      data.keyMetrics = undefined as never;
      expect(validateExportData(data)).toBe(false);
    });

    it('should return false when timeWeightedReturn metric is missing', () => {
      const data = createValidAnalyticsData();
      data.keyMetrics = {
        ...data.keyMetrics,
        timeWeightedReturn: undefined as never,
      };
      expect(validateExportData(data)).toBe(false);
    });

    it('should return false when maxDrawdown metric is missing', () => {
      const data = createValidAnalyticsData();
      data.keyMetrics = { ...data.keyMetrics, maxDrawdown: undefined as never };
      expect(validateExportData(data)).toBe(false);
    });

    it('should return false when sharpe metric is missing', () => {
      const data = createValidAnalyticsData();
      data.keyMetrics = { ...data.keyMetrics, sharpe: undefined as never };
      expect(validateExportData(data)).toBe(false);
    });

    it('should return false when winRate metric is missing', () => {
      const data = createValidAnalyticsData();
      data.keyMetrics = { ...data.keyMetrics, winRate: undefined as never };
      expect(validateExportData(data)).toBe(false);
    });

    it('should return false when volatility metric is missing', () => {
      const data = createValidAnalyticsData();
      data.keyMetrics = { ...data.keyMetrics, volatility: undefined as never };
      expect(validateExportData(data)).toBe(false);
    });

    it('should return false when monthlyPnL is missing', () => {
      const data = createValidAnalyticsData();
      data.monthlyPnL = undefined as never;
      expect(validateExportData(data)).toBe(false);
    });

    it('should return true when monthlyPnL is empty array (truthy check only)', () => {
      const data = createValidAnalyticsData();
      data.monthlyPnL = [];
      expect(validateExportData(data)).toBe(true);
    });

    it('should return true when optional metrics (sortino, beta, alpha) are missing', () => {
      const data = createValidAnalyticsData();
      data.keyMetrics = {
        ...data.keyMetrics,
        sortino: undefined,
        beta: undefined,
        alpha: undefined,
      };
      expect(validateExportData(data)).toBe(true);
    });

    it('should validate correctly with single point in charts', () => {
      const data = createValidAnalyticsData();
      data.performanceChart.points = [
        { x: 0, portfolio: 0, date: '2024-01-01', portfolioValue: 10000 },
      ];
      data.drawdownChart.points = [{ x: 0, value: -5, date: '2024-01-01' }];
      expect(validateExportData(data)).toBe(true);
    });

    it('should validate correctly with many data points', () => {
      const data = createValidAnalyticsData();
      data.performanceChart.points = Array.from({ length: 100 }, (_, i) => ({
        x: i,
        portfolio: i * 2,
        date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-01`,
        portfolioValue: 10000 + i * 100,
      }));
      expect(validateExportData(data)).toBe(true);
    });

    it('should validate correctly with single monthlyPnL entry', () => {
      const data = createValidAnalyticsData();
      data.monthlyPnL = [{ month: 'Jan', year: 2024, value: 2.5 }];
      expect(validateExportData(data)).toBe(true);
    });
  });
});
