# Charts Hooks Module

This directory contains extracted chart data processing hooks from the massive `useChartData` hook
(985 lines). Each hook is focused on a specific chart type for better maintainability, testability,
and reusability.

## Week 2 Refactoring Progress

### Completed Hooks

#### 1. usePortfolioHistoryData

**File**: `usePortfolioHistoryData.ts`

**Purpose**: Processes portfolio performance chart data with DeFi/Wallet breakdown

**Key Features**:

- Portfolio value over time transformation
- Performance metrics calculation (current value, total return, etc.)
- Stacked data generation for DeFi/Wallet visualization
- Drawdown reference data extraction
- Memoized for optimal performance

**Usage Example**:

```typescript
import { usePortfolioHistoryData } from "@/hooks/charts";

function PerformanceChart({ portfolioHistory, isLoading, error }) {
  const {
    performanceData,
    stackedPortfolioData,
    currentValue,
    totalReturn,
    isPositive,
    hasData,
  } = usePortfolioHistoryData({
    portfolioHistory,
    isLoading,
    error,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!hasData) return <EmptyState />;

  return (
    <div>
      <h2>Portfolio: ${currentValue.toLocaleString()}</h2>
      <p className={isPositive ? "text-green-500" : "text-red-500"}>
        {isPositive ? "+" : ""}
        {totalReturn.toFixed(2)}%
      </p>
      <LineChart data={performanceData}>
        <Line dataKey="value" stroke="#8b5cf6" />
      </LineChart>
    </div>
  );
}
```

**Stacked Area Chart Example**:

```typescript
function StackedPerformanceChart({ portfolioHistory }) {
  const { stackedPortfolioData } = usePortfolioHistoryData({
    portfolioHistory,
  });

  return (
    <AreaChart data={stackedPortfolioData}>
      <Area dataKey="defiValue" stackId="1" fill="#8b5cf6" name="DeFi" />
      <Area dataKey="walletValue" stackId="1" fill="#6366f1" name="Wallet" />
    </AreaChart>
  );
}
```

**Return Value**:

```typescript
{
  performanceData: PortfolioDataPoint[];           // Raw performance data
  stackedPortfolioData: PortfolioStackedDataPoint[]; // With DeFi/Wallet breakdown
  drawdownReferenceData: Array<{ date, portfolio_value }>; // For drawdown calculations
  currentValue: number;          // Latest portfolio value
  firstValue: number;            // Initial portfolio value
  totalReturn: number;           // Percentage return
  isPositive: boolean;           // Whether return is positive
  isLoading: boolean;            // Loading state
  error: string | null;          // Error message
  hasData: boolean;              // Whether data is available
}
```

**Tests**: 13 unit tests with 100% coverage

- Data transformation
- Metric calculations
- Edge cases (empty data, single point, zero values)
- Memoization
- Loading/error state propagation

---

#### 2. useAllocationData

**File**: `useAllocationData.ts`

**Purpose**: Processes asset allocation chart data with BTC/ETH/Stablecoin/Altcoin breakdown

**Key Features**:

- Asset allocation timeseries data transformation
- Category aggregation (BTC, ETH, Stablecoin, Altcoin)
- Current allocation state extraction
- Pie chart data generation for allocation visualization
- Multi-line chart data for allocation history
- Intelligent type detection (pre-aggregated vs raw timeseries)
- Memoized for optimal performance

**Usage Example**:

```typescript
import { useAllocationData } from "@/hooks/charts";

function AllocationChart({ allocationHistory, isLoading, error }) {
  const {
    allocationData,
    currentAllocation,
    pieChartData,
    hasData,
  } = useAllocationData({
    allocationHistory,
    isLoading,
    error,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!hasData) return <EmptyState />;

  return (
    <div>
      <h2>Current Allocation</h2>
      <div className="grid grid-cols-4 gap-4">
        <div>BTC: {currentAllocation?.btc.toFixed(1)}%</div>
        <div>ETH: {currentAllocation?.eth.toFixed(1)}%</div>
        <div>Stablecoin: {currentAllocation?.stablecoin.toFixed(1)}%</div>
        <div>Altcoin: {currentAllocation?.altcoin.toFixed(1)}%</div>
      </div>
      <AreaChart data={allocationData}>
        <Area dataKey="btc" stackId="1" fill="#f7931a" name="BTC" />
        <Area dataKey="eth" stackId="1" fill="#627eea" name="ETH" />
        <Area dataKey="stablecoin" stackId="1" fill="#26a17b" name="Stablecoin" />
        <Area dataKey="altcoin" stackId="1" fill="#8247e5" name="Altcoin" />
      </AreaChart>
    </div>
  );
}
```

**Pie Chart Example**:

```typescript
function AllocationPieChart({ allocationHistory }) {
  const { pieChartData, currentAllocation } = useAllocationData({
    allocationHistory,
  });

  if (!currentAllocation) return <EmptyState />;

  return (
    <div>
      <h3>Portfolio Breakdown</h3>
      <PieChart data={pieChartData}>
        <Pie
          dataKey="value"
          nameKey="id"
          label={({ id, percentage }) => `${id}: ${percentage.toFixed(1)}%`}
        />
      </PieChart>
    </div>
  );
}
```

**Return Value**:

```typescript
{
  allocationData: AssetAllocationPoint[];  // Time-series allocation percentages
  currentAllocation: {                     // Latest allocation state
    btc: number;
    eth: number;
    stablecoin: number;
    altcoin: number;
  } | null;
  pieChartData: Array<{                    // Pie chart data (sorted, filtered)
    id: string;
    value: number;
    percentage: number;
  }>;
  isLoading: boolean;                      // Loading state
  error: string | null;                    // Error message
  hasData: boolean;                        // Whether data is available
}
```

**Tests**: 23 unit tests with 100% coverage

- Data transformation (timeseries → aggregated)
- Type detection (pre-aggregated vs raw data)
- Current allocation extraction
- Pie chart data generation and filtering
- Edge cases (empty data, zero allocations, negative values)
- Percentage normalization
- Memoization
- Loading/error state propagation

---

#### 3. useDrawdownAnalysis

**File**: `useDrawdownAnalysis.ts`

**Purpose**: Calculates drawdown and recovery cycle analysis

**Key Features**:

- Drawdown calculation from portfolio history
- Recovery cycle detection and annotation
- Drawdown summary metrics (max drawdown, recovery times)
- Current underwater status tracking
- Recovery point identification
- Memoized for optimal performance

**Usage Example**:

```typescript
import { useDrawdownAnalysis } from "@/hooks/charts";

function DrawdownChart({ drawdownHistory, portfolioHistory, isLoading, error }) {
  const {
    drawdownData,
    drawdownMetrics,
    hasData,
  } = useDrawdownAnalysis({
    drawdownHistory,
    portfolioHistory,
    isLoading,
    error,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!hasData) return <EmptyState />;

  return (
    <div>
      <h2>Drawdown Analysis</h2>
      <div className="grid grid-cols-3 gap-4">
        <div>Max Drawdown: {(drawdownMetrics.maxDrawdown * 100).toFixed(2)}%</div>
        <div>Recoveries: {drawdownMetrics.totalRecoveries}</div>
        <div>Avg Recovery: {drawdownMetrics.averageRecoveryDays} days</div>
      </div>
      <AreaChart data={drawdownData}>
        <Area dataKey="drawdown" fill="#ef4444" stroke="#dc2626" />
        {drawdownData.map(
          (point, index) =>
            point.isRecoveryPoint && (
              <ReferenceDot
                key={index}
                x={point.date}
                y={point.drawdown}
                r={4}
                fill="#10b981"
              />
            )
        )}
      </AreaChart>
    </div>
  );
}
```

**Return Value**:

```typescript
{
  drawdownData: DrawdownDataPoint[];  // Drawdown timeseries with recovery annotations
  drawdownMetrics: {                  // Summary statistics
    maxDrawdown: number;
    totalRecoveries: number;
    averageRecoveryDays: number | null;
    currentDrawdown: number;
    currentStatus: "At Peak" | "Underwater";
    latestPeakDate?: string;
    latestRecoveryDurationDays?: number;
  };
  isLoading: boolean;                 // Loading state
  error: string | null;               // Error message
  hasData: boolean;                   // Whether data is available
}
```

**Tests**: 30+ unit tests with 100% coverage

- Drawdown calculation from portfolio history
- Recovery cycle detection
- Summary metrics calculation
- Edge cases (single points, all zeros, no recoveries)
- Override data handling
- Memoization
- Loading/error state propagation

---

#### 4. useRollingAnalytics

**File**: `useRollingAnalytics.ts`

**Purpose**: Processes rolling analytics (Sharpe ratio, volatility, daily yield)

**Key Features**:

- Sharpe ratio transformation with interpretation labels (Excellent, Good, Fair, Poor, Very Poor)
- Volatility transformation with risk level categorization (Low, Moderate, High, Very High)
- Daily yield aggregation with cumulative tracking
- Protocol-level yield breakdown
- Industry-standard threshold classification
- Memoized for optimal performance

**Usage Example**:

```typescript
import { useRollingAnalytics } from "@/hooks/charts";

function AnalyticsCharts({ dashboardData, dailyYieldData, isLoading, error }) {
  const {
    sharpeData,
    volatilityData,
    dailyYieldData: processedYield,
    hasData,
  } = useRollingAnalytics({
    sharpeHistory: dashboardData?.rolling_analytics.sharpe.rolling_sharpe_data,
    volatilityHistory: dashboardData?.rolling_analytics.volatility.rolling_volatility_data,
    dailyYieldHistory: dailyYieldData,
    isLoading,
    error,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!hasData) return <EmptyState />;

  return (
    <div className="grid gap-6">
      {/* Sharpe Ratio Chart */}
      <div>
        <h3>Risk-Adjusted Returns</h3>
        <LineChart data={sharpeData}>
          <Line
            dataKey="sharpe"
            stroke="#8b5cf6"
            dot={point => ({
              fill:
                point.interpretation === "Excellent"
                  ? "#10b981"
                  : point.interpretation === "Good"
                    ? "#84cc16"
                    : "#f97316",
            })}
          />
        </LineChart>
      </div>

      {/* Volatility Chart */}
      <div>
        <h3>Portfolio Volatility</h3>
        <LineChart data={volatilityData}>
          <Line
            dataKey="volatility"
            stroke="#ef4444"
            dot={point => ({
              fill:
                point.riskLevel === "Low"
                  ? "#10b981"
                  : point.riskLevel === "Moderate"
                    ? "#f59e0b"
                    : "#ef4444",
            })}
          />
        </LineChart>
      </div>

      {/* Daily Yield Chart */}
      <div>
        <h3>Daily Yield Earnings</h3>
        <ComposedChart data={processedYield}>
          <Bar dataKey="totalYield" fill="#8b5cf6" name="Daily Yield" />
          <Line dataKey="cumulativeYield" stroke="#10b981" name="Cumulative" />
        </ComposedChart>
      </div>
    </div>
  );
}
```

**Sharpe Interpretation Thresholds**:

- Excellent: > 2.0 (exceptional risk-adjusted returns)
- Good: > 1.0 to 2.0 (strong performance)
- Fair: > 0.0 to 1.0 (acceptable returns)
- Poor: > -1.0 to 0.0 (below market)
- Very Poor: ≤ -1.0 (significant underperformance)

**Volatility Risk Levels**:

- Low: < 10% (stable portfolio)
- Moderate: 10% to < 25% (typical DeFi volatility)
- High: 25% to < 50% (elevated risk)
- Very High: ≥ 50% (extreme volatility)

**Return Value**:

```typescript
{
  sharpeData: Array<{
    // Sharpe ratio with interpretations
    date: string;
    sharpe: number;
    interpretation: SharpeInterpretation;
  }>;
  volatilityData: Array<{
    // Volatility with risk levels
    date: string;
    volatility: number;
    riskLevel: VolatilityRiskLevel;
  }>;
  dailyYieldData: Array<{
    // Daily yield with cumulative tracking
    date: string;
    totalYield: number;
    cumulativeYield: number;
    protocolCount?: number;
  }>;
  isLoading: boolean; // Loading state
  error: string | null; // Error message
  hasData: boolean; // Whether any analytics data is available
}
```

**Tests**: 24 unit tests with 100% coverage

- Sharpe ratio interpretation thresholds
- Volatility risk level categorization
- Daily yield aggregation
- Data filtering (null values)
- Edge cases (empty data, boundary values)
- Combined datasets
- Memoization
- Loading/error state propagation

---

## Week 2 Refactoring - Complete! ✅

All four chart data hooks have been successfully extracted from the monolithic `useChartData` hook:

1. ✅ **usePortfolioHistoryData** - Portfolio performance data
2. ✅ **useAllocationData** - Asset allocation breakdown
3. ✅ **useDrawdownAnalysis** - Drawdown and recovery cycles
4. ✅ **useRollingAnalytics** - Risk metrics and yield analytics

**Total Test Coverage**: 90+ unit tests across all hooks

---

## Architecture Benefits

### Before Refactoring

- Single 985-line hook
- Multiple responsibilities mixed together
- Hard to test individual chart types
- Performance overhead from processing all charts
- Difficult to maintain and extend

### After Refactoring

- Focused, single-responsibility hooks (~150 lines each)
- Easy to test in isolation
- Can import only needed hooks
- Clear separation of concerns
- Easier to extend with new chart types

---

## Testing Strategy

Each hook includes comprehensive unit tests covering:

1. **Happy Path**: Correct data transformation and calculations
2. **Edge Cases**: Empty data, single points, zero values
3. **Performance**: Memoization verification
4. **Error Handling**: Loading and error state propagation
5. **Data Validation**: Type safety and data integrity

Test files are located in `tests/unit/hooks/charts/`

---

## Performance Optimizations

All hooks use React's `useMemo` to prevent unnecessary recalculations:

- Data transformations are memoized by input dependencies
- Metric calculations only recompute when source data changes
- Reference equality preserved for stable renders
- Efficient array operations (map, filter, reduce)

---

## Import Patterns

**Individual Import**:

```typescript
import { usePortfolioHistoryData } from "@/hooks/charts/usePortfolioHistoryData";
```

**Barrel Import** (recommended):

```typescript
import { usePortfolioHistoryData } from "@/hooks/charts";
```

**Type Imports**:

```typescript
import type { UsePortfolioHistoryDataParams, UsePortfolioHistoryDataResult } from "@/hooks/charts";
```

---

## Migration Guide

### Migrating from useChartData

If you're currently using `useChartData` and only need portfolio performance data:

**Before**:

```typescript
const { portfolioHistory, currentValue, totalReturn, isLoading, error } = useChartData(
  userId,
  selectedPeriod
);
```

**After**:

```typescript
const dashboardQuery = usePortfolioDashboard(userId);
const { performanceData, currentValue, totalReturn, isLoading, error } = usePortfolioHistoryData({
  portfolioHistory: dashboardQuery.portfolioHistory,
  isLoading: dashboardQuery.isLoading,
  error: dashboardQuery.error?.message,
});
```

**Benefits**:

- Only processes data you need
- Clearer dependency chain
- Easier to test
- Better TypeScript inference

### Migrating Allocation Data

If you're currently using `useChartData` and only need allocation data:

**Before**:

```typescript
const { allocationHistory, isLoading, error } = useChartData(userId, selectedPeriod);
```

**After**:

```typescript
const dashboardQuery = usePortfolioDashboard(userId);
const { allocationData, currentAllocation, pieChartData, isLoading, error } = useAllocationData({
  allocationHistory: dashboardQuery.allocationHistory,
  isLoading: dashboardQuery.isLoading,
  error: dashboardQuery.error?.message,
});
```

**Benefits**:

- Current allocation state extraction
- Pre-generated pie chart data
- Intelligent type detection
- Percentage normalization handled automatically

---

## Contributing

When adding new chart hooks:

1. Create a new file in `src/hooks/charts/`
2. Follow the naming pattern: `use{ChartType}Data.ts`
3. Add comprehensive JSDoc documentation
4. Export types and hook from `index.ts`
5. Create unit tests in `tests/unit/hooks/charts/`
6. Update this README with usage examples

---

_Last updated: 2025-11-30 | Week 2 Refactoring | 4 of 4 hooks complete ✅_
