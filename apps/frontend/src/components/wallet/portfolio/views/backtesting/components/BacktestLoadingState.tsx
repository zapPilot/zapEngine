import { ChartSkeleton, MetricsSkeleton } from "@/components/ui";

export function BacktestLoadingState() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-label="Running backtest simulation"
    >
      {/* Metrics skeleton (matches BacktestMetrics 3-column layout) */}
      <MetricsSkeleton />

      {/* Chart skeleton */}
      <div>
        <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Performance Chart
        </h4>
        <div className="rounded-xl bg-gray-800/20 p-6 border border-gray-800/60 animate-pulse">
          <ChartSkeleton className="bg-transparent" />
        </div>
      </div>

      <span className="sr-only">Loading backtest results...</span>
    </div>
  );
}
