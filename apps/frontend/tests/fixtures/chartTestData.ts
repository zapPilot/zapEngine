/**
 * Reusable test data fixtures for chart testing
 * Provides fluent builders and pre-built datasets for all chart types
 */

import type {
  AssetAllocationPoint,
  PortfolioDataPoint,
} from "@/types/portfolio";

import {
  DrawdownDataPoint,
  SharpeDataPoint,
  VolatilityDataPoint,
} from "../utils/chartHoverTestFactories";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Portfolio data builder with fluent API
 */
export class PortfolioDataBuilder {
  private points: Partial<PortfolioDataPoint>[] = [];

  /**
   * Add a single data point
   */
  add(point: Partial<PortfolioDataPoint>): this {
    this.points.push(point);
    return this;
  }

  /**
   * Add default data points with linear progression
   */
  withDefaults(count: number, startValue = 10000): this {
    for (let i = 0; i < count; i++) {
      const date = new Date("2025-01-01");
      date.setDate(date.getDate() + i);

      this.add({
        date: toIsoDate(date),
        value: startValue + i * 100,
        change: (i * 100) / startValue,
        benchmark: (startValue + i * 100) * 0.98,
        protocols: [],
        chainsCount: 1,
      });
    }
    return this;
  }

  /**
   * Add data points with a specific trend
   */
  withTrend(count: number, startValue: number, increment: number): this {
    for (let i = 0; i < count; i++) {
      const date = new Date("2025-01-01");
      date.setDate(date.getDate() + i);

      this.add({
        date: toIsoDate(date),
        value: startValue + i * increment,
        change: (i * increment) / startValue,
        benchmark: (startValue + i * increment) * 0.95,
        protocols: [],
        chainsCount: 1,
      });
    }
    return this;
  }

  /**
   * Add volatile data with random fluctuations
   */
  withVolatility(
    count: number,
    startValue: number,
    volatilityPercent: number
  ): this {
    let currentValue = startValue;

    for (let i = 0; i < count; i++) {
      const date = new Date("2025-01-01");
      date.setDate(date.getDate() + i);

      const change =
        (Math.random() - 0.5) * 2 * (volatilityPercent / 100) * startValue;
      currentValue += change;

      this.add({
        date: toIsoDate(date),
        value: currentValue,
        change: change / startValue,
        benchmark: currentValue * 0.97,
        protocols: [],
        chainsCount: 1,
      });
    }
    return this;
  }

  /**
   * Build the final portfolio data array
   */
  build(): PortfolioDataPoint[] {
    return this.points.map(point => ({
      date: point.date || "2025-01-01",
      value: point.value || 10000,
      change: point.change || 0,
      benchmark: point.benchmark,
      protocols: point.protocols || [],
      chainsCount: point.chainsCount || 1,
    }));
  }
}

/**
 * Allocation data builder
 */
export class AllocationDataBuilder {
  private points: AssetAllocationPoint[] = [];

  add(point: AssetAllocationPoint): this {
    this.points.push(point);
    return this;
  }

  withBalanced(count: number): this {
    for (let i = 0; i < count; i++) {
      const date = new Date("2025-01-01");
      date.setDate(date.getDate() + i);

      this.add({
        date: toIsoDate(date),
        btc: 30,
        eth: 25,
        stablecoin: 20,
        defi: 15,
        altcoin: 10,
      });
    }
    return this;
  }

  withShift(
    count: number,
    from: keyof AssetAllocationPoint,
    to: keyof AssetAllocationPoint
  ): this {
    for (let i = 0; i < count; i++) {
      const date = new Date("2025-01-01");
      date.setDate(date.getDate() + i);

      const shift = (i / count) * 20; // Shift up to 20%
      const base: AssetAllocationPoint = {
        date: toIsoDate(date),
        btc: 30,
        eth: 25,
        stablecoin: 20,
        defi: 15,
        altcoin: 10,
      };

      if (from !== "date" && to !== "date") {
        base[from] = Math.max(0, base[from] - shift);
        base[to] = base[to] + shift;
      }

      this.add(base);
    }
    return this;
  }

  build(): AssetAllocationPoint[] {
    return this.points;
  }
}

/**
 * Pre-built fixtures for common test scenarios
 */
export const ChartTestFixtures = {
  /**
   * Small dataset for quick tests (5 points)
   */
  smallPortfolioData(): PortfolioDataPoint[] {
    return new PortfolioDataBuilder().withDefaults(5).build();
  },

  /**
   * Medium dataset for standard tests (30 points)
   */
  mediumPortfolioData(): PortfolioDataPoint[] {
    return new PortfolioDataBuilder().withDefaults(30).build();
  },

  /**
   * Large dataset for stress tests (90 points)
   */
  largePortfolioData(): PortfolioDataPoint[] {
    return new PortfolioDataBuilder().withDefaults(90).build();
  },

  /**
   * Portfolio with upward trend
   */
  portfolioUptrend(): PortfolioDataPoint[] {
    return new PortfolioDataBuilder().withTrend(30, 10000, 500).build();
  },

  /**
   * Portfolio with downward trend
   */
  portfolioDowntrend(): PortfolioDataPoint[] {
    return new PortfolioDataBuilder().withTrend(30, 15000, -300).build();
  },

  /**
   * Portfolio with high volatility
   */
  portfolioVolatile(): PortfolioDataPoint[] {
    return new PortfolioDataBuilder().withVolatility(30, 10000, 15).build();
  },

  /**
   * Empty portfolio data
   */
  emptyPortfolioData(): PortfolioDataPoint[] {
    return [];
  },

  /**
   * Single data point (edge case)
   */
  singlePortfolioPoint(): PortfolioDataPoint[] {
    return new PortfolioDataBuilder().withDefaults(1).build();
  },

  /**
   * Allocation data with balanced distribution
   */
  balancedAllocation(): AssetAllocationPoint[] {
    return new AllocationDataBuilder().withBalanced(30).build();
  },

  /**
   * Allocation data with shift from BTC to ETH
   */
  allocationBtcToEth(): AssetAllocationPoint[] {
    return new AllocationDataBuilder().withShift(30, "btc", "eth").build();
  },

  /**
   * Allocation data with shift to stablecoins
   */
  allocationToStables(): AssetAllocationPoint[] {
    return new AllocationDataBuilder()
      .withShift(30, "btc", "stablecoin")
      .build();
  },

  /**
   * Empty allocation data
   */
  emptyAllocationData(): AssetAllocationPoint[] {
    return [];
  },

  /**
   * Drawdown data with progressive decline
   */
  drawdownData(): DrawdownDataPoint[] {
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date("2025-01-01");
      date.setDate(date.getDate() + i);

      const drawdown = Math.min(0, i <= 15 ? -i * 0.6 : -(30 - i) * 0.6);
      const isRecoveryPoint = i === 0 || drawdown >= -0.1;

      return {
        date: toIsoDate(date),
        drawdown_pct: drawdown,
        portfolio_value: 10000 + drawdown * 80,
        is_recovery_point: isRecoveryPoint,
        days_from_peak: isRecoveryPoint ? 0 : Math.max(0, i - 8),
        peak_date:
          i === 0 ? toIsoDate(date) : toIsoDate(new Date("2025-01-01")),
        recovery_depth_pct: drawdown,
      } satisfies DrawdownDataPoint;
    });
  },

  /**
   * Drawdown with recovery
   */
  drawdownWithRecovery(): DrawdownDataPoint[] {
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date("2025-01-01");
      date.setDate(date.getDate() + i);

      const decline = i < 12 ? -i * 0.8 : -(12 - Math.max(0, i - 12)) * 0.8;
      const drawdown = Math.min(0, decline);
      const isRecoveryPoint = drawdown >= -0.05;

      return {
        date: toIsoDate(date),
        drawdown_pct: drawdown,
        portfolio_value: 10000 + drawdown * 90,
        is_recovery_point: isRecoveryPoint,
        days_from_peak: isRecoveryPoint ? 0 : Math.max(0, i - 7),
        peak_date:
          i <= 12
            ? toIsoDate(new Date("2025-01-01"))
            : toIsoDate(new Date("2025-01-13")),
        recovery_duration_days: isRecoveryPoint
          ? Math.max(0, i - 12)
          : undefined,
        recovery_depth_pct: drawdown,
      } satisfies DrawdownDataPoint;
    });
  },

  /**
   * Sharpe ratio data with variation
   */
  sharpeData(): SharpeDataPoint[] {
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date("2025-01-01");
      date.setDate(date.getDate() + i);

      return {
        date: toIsoDate(date),
        rolling_sharpe_ratio: 1.0 + Math.sin(i / 5) * 0.5,
      };
    });
  },

  /**
   * Volatility data with spikes
   */
  volatilityData(): VolatilityDataPoint[] {
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date("2025-01-01");
      date.setDate(date.getDate() + i);

      const spike = i % 10 === 0 ? 10 : 0;

      return {
        date: toIsoDate(date),
        annualized_volatility_pct: 20 + spike + Math.random() * 5,
      };
    });
  },

  /**
   * Complete dataset for all chart types (for integration tests)
   */
  completeDataset() {
    return {
      portfolio: this.mediumPortfolioData(),
      allocation: this.balancedAllocation(),
      drawdown: this.drawdownData(),
      sharpe: this.sharpeData(),
      volatility: this.volatilityData(),
    };
  },
};
