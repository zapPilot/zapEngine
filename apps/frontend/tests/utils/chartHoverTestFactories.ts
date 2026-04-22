/**
 * Type-safe factories for creating chart hover test data
 * Provides builders for all chart types with proper TypeScript inference
 */

import type { UseChartHoverOptions } from '@/hooks/ui/useChartHover';
import type {
  AllocationHoverData,
  ChartHoverState,
  DrawdownHoverData,
  PerformanceHoverData,
  SharpeHoverData,
  VolatilityHoverData,
} from '@/types';
import type {
  AssetAllocationPoint,
  PortfolioDataPoint,
} from '@/types/portfolio';

/**
 * Base factory interface for creating typed test data
 */
interface BaseChartDataFactory<T> {
  /** Create a single data point with optional overrides */
  createPoint(overrides?: Partial<T>): T;
  /** Create multiple data points */
  createPoints(count: number, generator?: (index: number) => Partial<T>): T[];
}

/**
 * Factory for PortfolioDataPoint test data
 */
export const PortfolioDataFactory: BaseChartDataFactory<PortfolioDataPoint> = {
  createPoint(overrides = {}) {
    return {
      date: '2025-01-01',
      value: 10000,
      change: 0,
      protocols: [],
      chainsCount: 1,
      ...overrides,
    };
  },

  createPoints(count, generator) {
    return Array.from({ length: count }, (_, i) => {
      const baseDate = new Date('2025-01-01');
      baseDate.setDate(baseDate.getDate() + i);

      return this.createPoint({
        date: baseDate.toISOString().split('T')[0],
        value: 10000 + i * 100,
        change: i * 0.01,
        ...(generator ? generator(i) : {}),
      });
    });
  },
};

/**
 * Factory for AssetAllocationPoint test data
 */
export const AllocationDataFactory: BaseChartDataFactory<AssetAllocationPoint> =
  {
    createPoint(overrides = {}) {
      return {
        date: '2025-01-01',
        btc: 40,
        eth: 30,
        stablecoin: 15,
        defi: 10,
        altcoin: 5,
        ...overrides,
      };
    },

    createPoints(count, generator) {
      return Array.from({ length: count }, (_, i) => {
        const baseDate = new Date('2025-01-01');
        baseDate.setDate(baseDate.getDate() + i);

        return this.createPoint({
          date: baseDate.toISOString().split('T')[0],
          ...(generator ? generator(i) : {}),
        });
      });
    },
  };

/**
 * Drawdown data point interface matching production
 */
export interface DrawdownDataPoint {
  date: string;
  drawdown_pct: number;
  portfolio_value: number;
  peak_date?: string;
  days_from_peak?: number;
  recovery_duration_days?: number;
  recovery_depth_pct?: number;
  is_recovery_point?: boolean;
}

export const DrawdownDataFactory: BaseChartDataFactory<DrawdownDataPoint> = {
  createPoint(overrides = {}) {
    return {
      date: '2025-01-01',
      drawdown_pct: -5,
      portfolio_value: 10000,
      ...overrides,
    };
  },

  createPoints(count, generator) {
    return Array.from({ length: count }, (_, i) => {
      const baseDate = new Date('2025-01-01');
      baseDate.setDate(baseDate.getDate() + i);

      return this.createPoint({
        date: baseDate.toISOString().split('T')[0],
        drawdown_pct: -5 - i * 0.5,
        portfolio_value: 10000 - i * 50,
        ...(generator ? generator(i) : {}),
      });
    });
  },
};

/**
 * Sharpe ratio data point
 */
export interface SharpeDataPoint {
  date: string;
  rolling_sharpe_ratio: number;
}

export const SharpeDataFactory: BaseChartDataFactory<SharpeDataPoint> = {
  createPoint(overrides = {}) {
    return {
      date: '2025-01-01',
      rolling_sharpe_ratio: 1.5,
      ...overrides,
    };
  },

  createPoints(count, generator) {
    return Array.from({ length: count }, (_, i) => {
      const baseDate = new Date('2025-01-01');
      baseDate.setDate(baseDate.getDate() + i);

      return this.createPoint({
        date: baseDate.toISOString().split('T')[0],
        rolling_sharpe_ratio: 1.5 + (Math.random() - 0.5) * 0.5,
        ...(generator ? generator(i) : {}),
      });
    });
  },
};

/**
 * Volatility data point
 */
export interface VolatilityDataPoint {
  date: string;
  annualized_volatility_pct: number;
}

export const VolatilityDataFactory: BaseChartDataFactory<VolatilityDataPoint> =
  {
    createPoint(overrides = {}) {
      return {
        date: '2025-01-01',
        annualized_volatility_pct: 25,
        ...overrides,
      };
    },

    createPoints(count, generator) {
      return Array.from({ length: count }, (_, i) => {
        const baseDate = new Date('2025-01-01');
        baseDate.setDate(baseDate.getDate() + i);

        return this.createPoint({
          date: baseDate.toISOString().split('T')[0],
          annualized_volatility_pct: 25 + (Math.random() - 0.5) * 10,
          ...(generator ? generator(i) : {}),
        });
      });
    },
  };

/**
 * Type-safe hover data builders for each chart type
 */
export const HoverDataBuilders = {
  /**
   * Build performance hover data
   */
  performance(
    point: PortfolioDataPoint,
    x: number,
    y: number,
  ): PerformanceHoverData {
    return {
      chartType: 'performance' as const,
      x,
      y,
      date: new Date(point.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      value: point.value,
    };
  },

  /**
   * Build allocation hover data
   */
  allocation(
    point: AssetAllocationPoint,
    x: number,
    y: number,
  ): AllocationHoverData {
    const total =
      point.btc + point.eth + point.stablecoin + point.defi + point.altcoin;
    return {
      chartType: 'asset-allocation' as const,
      x,
      y,
      date: new Date(point.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      btc: total > 0 ? (point.btc / total) * 100 : 0,
      eth: total > 0 ? (point.eth / total) * 100 : 0,
      stablecoin: total > 0 ? (point.stablecoin / total) * 100 : 0,
      altcoin: total > 0 ? (point.altcoin / total) * 100 : 0,
    };
  },

  /**
   * Build drawdown hover data with peak detection
   */
  drawdown(
    point: DrawdownDataPoint,
    x: number,
    y: number,
    index: number,
    allPoints: DrawdownDataPoint[],
  ): DrawdownHoverData {
    const priorData = allPoints.slice(0, index + 1);
    const peak = Math.max(...priorData.map((p) => p.portfolio_value));
    const peakIndex = priorData.findIndex((p) => p.portfolio_value === peak);
    const peakDate = priorData[peakIndex]?.date || point.date;

    return {
      chartType: 'drawdown-recovery' as const,
      x,
      y,
      date: new Date(point.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      drawdown: point.drawdown_pct,
      peakDate: new Date(point.peak_date ?? peakDate).toLocaleDateString(
        'en-US',
        {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        },
      ),
      distanceFromPeak: point.days_from_peak ?? index - peakIndex,
      isRecoveryPoint:
        point.is_recovery_point ?? Math.abs(point.drawdown_pct) < 0.05,
      recoveryDurationDays: point.recovery_duration_days,
      recoveryDepth: point.recovery_depth_pct,
    };
  },

  /**
   * Build sharpe hover data
   */
  sharpe(point: SharpeDataPoint, x: number, y: number): SharpeHoverData {
    const sharpe = point.rolling_sharpe_ratio || 0;
    let interpretation: SharpeHoverData['interpretation'];

    if (sharpe >= 2.0) {
      interpretation = 'Excellent';
    } else if (sharpe >= 1.5) {
      interpretation = 'Good';
    } else if (sharpe >= 1.0) {
      interpretation = 'Fair';
    } else if (sharpe >= 0.5) {
      interpretation = 'Poor';
    } else {
      interpretation = 'Very Poor';
    }

    return {
      chartType: 'sharpe' as const,
      x,
      y,
      date: new Date(point.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      sharpe,
      interpretation,
    };
  },

  /**
   * Build volatility hover data
   */
  volatility(
    point: VolatilityDataPoint,
    x: number,
    y: number,
  ): VolatilityHoverData {
    const vol = point.annualized_volatility_pct || 0;
    let riskLevel: VolatilityHoverData['riskLevel'];

    if (vol >= 35) {
      riskLevel = 'Very High';
    } else if (vol >= 25) {
      riskLevel = 'High';
    } else if (vol >= 15) {
      riskLevel = 'Moderate';
    } else {
      riskLevel = 'Low';
    }

    return {
      chartType: 'volatility' as const,
      x,
      y,
      date: new Date(point.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      volatility: vol,
      riskLevel,
    };
  },
};

/**
 * Creates type-safe useChartHover options for a given chart type
 *
 * @param config - Chart configuration including dimensions, value range, and data extractors
 * @returns Complete UseChartHoverOptions ready for use in tests
 */
function createChartHoverOptions<T>(config: {
  chartType: string;
  chartWidth?: number;
  chartHeight?: number;
  chartPadding?: number;
  minValue: number;
  maxValue: number;
  getYValue: (point: T) => number;
  buildHoverData: (
    point: T,
    x: number,
    y: number,
    index: number,
  ) => ChartHoverState;
  enabled?: boolean;
}): UseChartHoverOptions<T> {
  return {
    chartType: config.chartType,
    chartWidth: config.chartWidth ?? 800,
    chartHeight: config.chartHeight ?? 300,
    chartPadding: config.chartPadding ?? 10,
    minValue: config.minValue,
    maxValue: config.maxValue,
    getYValue: config.getYValue,
    buildHoverData: config.buildHoverData,
    enabled: config.enabled ?? true,
  };
}

/**
 * Convenience factory for common chart types
 */
export const ChartHoverOptionsFactory = {
  performance(data: PortfolioDataPoint[]) {
    const minValue = Math.min(...data.map((d) => d.value));
    const maxValue = Math.max(...data.map((d) => d.value));

    return createChartHoverOptions<PortfolioDataPoint>({
      chartType: 'performance',
      minValue,
      maxValue,
      getYValue: (point) => point.value,
      buildHoverData: (point, x, y) =>
        HoverDataBuilders.performance(point, x, y),
    });
  },

  allocation() {
    return createChartHoverOptions<AssetAllocationPoint>({
      chartType: 'allocation',
      minValue: 0,
      maxValue: 100,
      getYValue: () => 50,
      buildHoverData: (point, x, y) =>
        HoverDataBuilders.allocation(point, x, y),
    });
  },

  drawdown(data: DrawdownDataPoint[]) {
    return createChartHoverOptions<DrawdownDataPoint>({
      chartType: 'drawdown-recovery',
      minValue: -20,
      maxValue: 0,
      getYValue: (point) => point.drawdown_pct,
      buildHoverData: (point, x, y, index) =>
        HoverDataBuilders.drawdown(point, x, y, index, data),
    });
  },

  sharpe() {
    return createChartHoverOptions<SharpeDataPoint>({
      chartType: 'sharpe',
      minValue: 0,
      maxValue: 2.5,
      getYValue: (point) => point.rolling_sharpe_ratio,
      buildHoverData: (point, x, y) => HoverDataBuilders.sharpe(point, x, y),
    });
  },

  volatility() {
    return createChartHoverOptions<VolatilityDataPoint>({
      chartType: 'volatility',
      minValue: 10,
      maxValue: 40,
      getYValue: (point) => point.annualized_volatility_pct,
      buildHoverData: (point, x, y) =>
        HoverDataBuilders.volatility(point, x, y),
    });
  },
};
