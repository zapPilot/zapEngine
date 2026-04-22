/**
 * Analytics Export Service Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateExportData } from '@/lib/analytics/analyticsValidation';
import * as csvGenerator from '@/lib/csvGenerator';
import { exportAnalyticsToCSV } from '@/services/analyticsExportService';
import type { AnalyticsData } from '@/types/analytics';

// =============================================================================
// TEST DATA
// =============================================================================

const validAnalyticsData: AnalyticsData = {
  performanceChart: {
    points: [
      {
        x: 0,
        portfolio: 0,
        btc: 0,
        date: '2024-01-17',
        portfolioValue: 10000,
      },
      {
        x: 100,
        portfolio: 100,
        btc: 50,
        date: '2025-01-17',
        portfolioValue: 22450,
      },
    ],
    startDate: '2024-01-17',
    endDate: '2025-01-17',
  },
  drawdownChart: {
    points: [
      { x: 0, value: 0, date: '2024-01-17' },
      { x: 100, value: -12.8, date: '2025-01-17' },
    ],
    maxDrawdown: -12.8,
    maxDrawdownDate: '2024-03-15',
  },
  keyMetrics: {
    timeWeightedReturn: {
      value: '+124.5%',
      subValue: '+2.4% vs BTC',
      trend: 'up',
    },
    maxDrawdown: {
      value: '12.8%',
      subValue: 'Recovered in 14 days',
      trend: 'down',
    },
    sharpe: {
      value: '2.45',
      subValue: 'Top 5% of Pilots',
      trend: 'up',
    },
    winRate: {
      value: '68%',
      subValue: '8 of 12 months',
      trend: 'up',
    },
    volatility: {
      value: '22.8%',
      subValue: 'Medium risk',
      trend: 'neutral',
    },
  },
  monthlyPnL: [
    { month: 'Jan', year: 2024, value: 12.5 },
    { month: 'Feb', year: 2024, value: -3.2 },
  ],
};

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe('validateExportData', () => {
  it('should return true for complete valid data', () => {
    expect(validateExportData(validAnalyticsData)).toBe(true);
  });

  it('should return false for null data', () => {
    expect(validateExportData(null)).toBe(false);
  });

  it('should return false for empty performance chart', () => {
    const data = {
      ...validAnalyticsData,
      performanceChart: {
        ...validAnalyticsData.performanceChart,
        points: [],
      },
    };

    expect(validateExportData(data)).toBe(false);
  });

  it('should return false for missing performance chart', () => {
    const data = {
      ...validAnalyticsData,
      performanceChart: null as never,
    };

    expect(validateExportData(data)).toBe(false);
  });

  it('should return false for empty drawdown chart', () => {
    const data = {
      ...validAnalyticsData,
      drawdownChart: {
        ...validAnalyticsData.drawdownChart,
        points: [],
      },
    };

    expect(validateExportData(data)).toBe(false);
  });

  it('should return false for missing drawdown chart', () => {
    const data = {
      ...validAnalyticsData,
      drawdownChart: null as never,
    };

    expect(validateExportData(data)).toBe(false);
  });

  it('should return false for missing key metrics', () => {
    const data = {
      ...validAnalyticsData,
      keyMetrics: null as never,
    };

    expect(validateExportData(data)).toBe(false);
  });

  it('should return false for missing required metric (TWR)', () => {
    const data = {
      ...validAnalyticsData,
      keyMetrics: {
        ...validAnalyticsData.keyMetrics,
        timeWeightedReturn: null as never,
      },
    };

    expect(validateExportData(data)).toBe(false);
  });

  it('should return false for missing required metric (Sharpe)', () => {
    const data = {
      ...validAnalyticsData,
      keyMetrics: {
        ...validAnalyticsData.keyMetrics,
        sharpe: null as never,
      },
    };

    expect(validateExportData(data)).toBe(false);
  });

  it('should return false for missing monthly PnL', () => {
    const data = {
      ...validAnalyticsData,
      monthlyPnL: null as never,
    };

    expect(validateExportData(data)).toBe(false);
  });

  it('should return true with optional metrics missing', () => {
    // Optional metrics (sortino, beta, alpha) can be missing
    expect(validateExportData(validAnalyticsData)).toBe(true);
  });
});

// =============================================================================
// EXPORT SERVICE TESTS
// =============================================================================

describe('exportAnalyticsToCSV', () => {
  let generateCSVSpy: ReturnType<typeof vi.spyOn>;
  let generateFilenameSpy: ReturnType<typeof vi.spyOn>;
  let downloadCSVSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock CSV generator functions
    generateCSVSpy = vi
      .spyOn(csvGenerator, 'generateAnalyticsCSV')
      .mockReturnValue('mock,csv,content');

    generateFilenameSpy = vi
      .spyOn(csvGenerator, 'generateExportFilename')
      .mockReturnValue('portfolio-analytics-0x1234...5678-2025-01-17.csv');

    downloadCSVSpy = vi
      .spyOn(csvGenerator, 'downloadCSV')
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully export valid data', async () => {
    const result = await exportAnalyticsToCSV(
      '0x1234567890abcdef1234567890abcdef12345678',
      validAnalyticsData,
      { key: '1Y', days: 365, label: '1 Year' },
    );

    expect(result.success).toBe(true);
    expect(result.filename).toBe(
      'portfolio-analytics-0x1234...5678-2025-01-17.csv',
    );
    expect(result.error).toBeUndefined();
  });

  it('includes walletFilter in metadata when walletFilter is provided', async () => {
    // Exercises the `walletFilter !== undefined && { walletFilter }` true branch
    const walletAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
    await exportAnalyticsToCSV(
      '0x1234567890abcdef1234567890abcdef12345678',
      validAnalyticsData,
      { key: '1Y', days: 365, label: '1 Year' },
      walletAddress,
    );

    // generateAnalyticsCSV should have been called with metadata including walletFilter
    expect(generateCSVSpy).toHaveBeenCalledWith(
      expect.objectContaining({ walletFilter: walletAddress }),
    );
  });

  it('should call CSV generation functions', async () => {
    await exportAnalyticsToCSV(
      '0x1234567890abcdef1234567890abcdef12345678',
      validAnalyticsData,
      { key: '1Y', days: 365, label: '1 Year' },
    );

    expect(generateCSVSpy).toHaveBeenCalledTimes(1);
    expect(generateFilenameSpy).toHaveBeenCalledTimes(1);
    expect(downloadCSVSpy).toHaveBeenCalledTimes(1);
  });

  it('should pass correct metadata to CSV generator', async () => {
    const timePeriod = { key: '1Y', days: 365, label: '1 Year' };
    await exportAnalyticsToCSV(
      '0x1234567890abcdef1234567890abcdef12345678',
      validAnalyticsData,
      timePeriod,
    );

    expect(generateCSVSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '0x1234567890abcdef1234567890abcdef12345678',
        timePeriod,
        data: validAnalyticsData,
        timestamp: expect.any(Date),
      }),
    );
  });

  it('should trigger download with correct content and filename', async () => {
    await exportAnalyticsToCSV(
      '0x1234567890abcdef1234567890abcdef12345678',
      validAnalyticsData,
      { key: '1Y', days: 365, label: '1 Year' },
    );

    expect(downloadCSVSpy).toHaveBeenCalledWith(
      'mock,csv,content',
      'portfolio-analytics-0x1234...5678-2025-01-17.csv',
    );
  });

  it('should return error for missing user ID', async () => {
    const result = await exportAnalyticsToCSV('', validAnalyticsData, {
      key: '1Y',
      days: 365,
      label: '1 Year',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('User ID is required for export');
    expect(downloadCSVSpy).not.toHaveBeenCalled();
  });

  it('should return error for null user ID', async () => {
    const result = await exportAnalyticsToCSV(
      null as never,
      validAnalyticsData,
      {
        key: '1Y',
        days: 365,
        label: '1 Year',
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('User ID is required for export');
  });

  it('should return error for whitespace-only user ID', async () => {
    const result = await exportAnalyticsToCSV('   ', validAnalyticsData, {
      key: '1Y',
      days: 365,
      label: '1 Year',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('User ID is required for export');
  });

  it('should return error for invalid analytics data', async () => {
    const invalidData = {
      ...validAnalyticsData,
      performanceChart: {
        ...validAnalyticsData.performanceChart,
        points: [],
      },
    };

    const result = await exportAnalyticsToCSV(
      '0x1234567890abcdef1234567890abcdef12345678',
      invalidData,
      { key: '1Y', days: 365, label: '1 Year' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Invalid analytics data - missing required fields',
    );
    expect(downloadCSVSpy).not.toHaveBeenCalled();
  });

  it('should handle CSV generation errors', async () => {
    // Mock CSV generator to throw error
    generateCSVSpy.mockImplementation(() => {
      throw new Error('CSV generation failed');
    });

    const result = await exportAnalyticsToCSV(
      '0x1234567890abcdef1234567890abcdef12345678',
      validAnalyticsData,
      { key: '1Y', days: 365, label: '1 Year' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to generate CSV file');
    expect(result.error).toContain('CSV generation failed');
  });

  it('should handle download errors', async () => {
    // Mock download to throw error
    downloadCSVSpy.mockImplementation(() => {
      throw new Error('Download failed');
    });

    const result = await exportAnalyticsToCSV(
      '0x1234567890abcdef1234567890abcdef12345678',
      validAnalyticsData,
      { key: '1Y', days: 365, label: '1 Year' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to generate CSV file');
  });

  it('should log errors using logger', async () => {
    // Import logger
    const { logger } = await import('@/utils/logger');
    const loggerErrorSpy = vi
      .spyOn(logger, 'error')
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .mockImplementation(() => {});

    generateCSVSpy.mockImplementation(() => {
      throw new Error('Test error');
    });

    await exportAnalyticsToCSV(
      '0x1234567890abcdef1234567890abcdef12345678',
      validAnalyticsData,
      { key: '1Y', days: 365, label: '1 Year' },
    );

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Export failed',
      expect.any(Error),
      'analyticsExportService',
    );

    loggerErrorSpy.mockRestore();
  });

  it('returns generic message when thrown value is not an Error instance', async () => {
    // Exercises the `error instanceof Error ? ... : "Failed to generate CSV file"` false branch
    generateCSVSpy.mockImplementation(() => {
      throw 'plain string error';
    });

    const result = await exportAnalyticsToCSV(
      '0x1234567890abcdef1234567890abcdef12345678',
      validAnalyticsData,
      { key: '1Y', days: 365, label: '1 Year' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to generate CSV file');
  });

  it('should work with different time periods', async () => {
    const timePeriods = [
      { key: '1M', days: 30, label: '1 Month' },
      { key: '3M', days: 90, label: '3 Months' },
      { key: '6M', days: 180, label: '6 Months' },
      { key: '1Y', days: 365, label: '1 Year' },
      { key: 'ALL', days: 730, label: 'All Time' },
    ];

    for (const period of timePeriods) {
      const result = await exportAnalyticsToCSV(
        '0x1234567890abcdef1234567890abcdef12345678',
        validAnalyticsData,
        period,
      );

      expect(result.success).toBe(true);
    }
  });
});
