/**
 * Chart Section Component
 *
 * Main chart display with tabs and time period selector
 */

import { ArrowDownRight, TrendingUp } from "lucide-react";
import type { ElementType, ReactElement } from "react";

import { BaseCard } from "@/components/ui/BaseCard";
import type { AnalyticsData, AnalyticsTimePeriod } from "@/types/analytics";

import { DrawdownChart } from "../charts/DrawdownChart";
import { PerformanceChart } from "../charts/PerformanceChart";
import { ANALYTICS_TIME_PERIODS } from "../constants";

/**
 * Chart tab definition
 */
interface ChartTab {
  id: "performance" | "drawdown";
  label: string;
  icon: ElementType;
}

const CHART_TABS: ChartTab[] = [
  { id: "performance", label: "Performance", icon: TrendingUp },
  { id: "drawdown", label: "Drawdown", icon: ArrowDownRight },
];

/**
 * Chart Section Props
 */
interface ChartSectionProps {
  data: AnalyticsData;
  selectedPeriod: AnalyticsTimePeriod;
  activeChartTab: "performance" | "drawdown";
  onPeriodChange: (period: AnalyticsTimePeriod) => void;
  onChartTabChange: (tab: "performance" | "drawdown") => void;
  isLoading?: boolean;
}

/**
 * Chart Section
 *
 * Displays the main chart area with:
 * - Chart type tabs (Performance/Drawdown)
 * - Time period selector (1M/3M/6M/1Y/ALL)
 * - Active chart display
 */
export function ChartSection({
  data,
  selectedPeriod,
  activeChartTab,
  onPeriodChange,
  onChartTabChange,
  isLoading = false,
}: ChartSectionProps): ReactElement {
  return (
    <BaseCard variant="glass" className="p-1">
      <div className="p-4 border-b border-gray-800/50 flex justify-between items-center bg-gray-900/40 rounded-t-xl">
        {/* Chart Type Tabs */}
        <div className="flex gap-1 bg-gray-800/50 p-1 rounded-lg">
          {CHART_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => onChartTabChange(tab.id)}
              disabled={isLoading}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeChartTab === tab.id
                  ? "bg-gray-700 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-300"
              } ${isLoading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Time Period Selector */}
        <div className="flex gap-2">
          {ANALYTICS_TIME_PERIODS.map(period => (
            <button
              key={period.key}
              onClick={() => onPeriodChange(period)}
              disabled={isLoading}
              className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                selectedPeriod.key === period.key
                  ? "bg-purple-500/20 text-purple-300"
                  : "text-gray-500 hover:text-gray-300"
              } ${isLoading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          // Skeleton for chart area only
          <div
            className="h-64 bg-gray-800/30 rounded-xl animate-pulse"
            role="status"
            aria-label="Loading chart"
          />
        ) : (
          <>
            {activeChartTab === "performance" && (
              <PerformanceChart
                chartData={data.performanceChart.points}
                startDate={data.performanceChart.startDate}
                endDate={data.performanceChart.endDate}
              />
            )}
            {activeChartTab === "drawdown" && (
              <div className="space-y-3">
                <DrawdownChart
                  chartData={data.drawdownChart.points}
                  maxDrawdown={data.drawdownChart.maxDrawdown}
                />
                <p className="text-xs text-gray-500">
                  <span className="text-white font-medium">
                    Resilience Analysis:
                  </span>{" "}
                  Maximum drawdown of -12.8% with an average recovery time of 14
                  days. This is 52% better than the Bitcoin benchmark (-25%).
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </BaseCard>
  );
}
