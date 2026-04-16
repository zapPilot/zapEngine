/**
 * Analytics View (Presentation Component)
 *
 * Pure presentation component for analytics dashboard
 * Receives all data and handlers via props
 */

import type { ReactElement } from "react";

import type {
  AnalyticsData,
  AnalyticsTimePeriod,
  WalletFilter,
  WalletOption,
} from "@/types/analytics";

import { AdditionalMetricsGrid } from "./components/AdditionalMetricsGrid";
import { AnalyticsHeader } from "./components/AnalyticsHeader";
import { ChartSection } from "./components/ChartSection";
import { KeyMetricsGrid } from "./components/KeyMetricsGrid";
import { MonthlyPnLHeatmap } from "./components/MonthlyPnLHeatmap";

/**
 * Analytics View Props
 */
interface AnalyticsViewProps {
  /** Transformed analytics data */
  data: AnalyticsData;
  /** Currently selected time period */
  selectedPeriod: AnalyticsTimePeriod;
  /** Active chart tab */
  activeChartTab: "performance" | "drawdown";
  /** Period change handler */
  onPeriodChange: (period: AnalyticsTimePeriod) => void;
  /** Chart tab change handler */
  onChartTabChange: (tab: "performance" | "drawdown") => void;
  /** Export handler function */
  onExport: () => void;
  /** Loading state for individual components */
  isLoading?: boolean;
  /** Independent loading state for monthly PnL (yield/daily endpoint) */
  isMonthlyPnLLoading?: boolean;
  /** Whether export is in progress */
  isExporting?: boolean;
  /** Export error message */
  exportError?: string | null;
  /** Currently selected wallet filter */
  selectedWallet: WalletFilter;
  /** Available wallet options */
  availableWallets: WalletOption[];
  /** Wallet selection change handler */
  onWalletChange: (wallet: WalletFilter) => void;
  /** Whether to show wallet selector */
  showWalletSelector: boolean;
}

/**
 * Analytics View
 *
 * Pure presentation component composing:
 * - Header with title and export button
 * - Chart section with tabs and period selector
 * - Key metrics grid (4 primary metrics)
 * - Additional metrics grid (4 secondary metrics)
 * - Monthly PnL heatmap
 *
 * All state and data fetching handled by AnalyticsViewContainer.
 */
export function AnalyticsView({
  data,
  selectedPeriod,
  activeChartTab,
  onPeriodChange,
  onChartTabChange,
  onExport,
  isLoading = false,
  isMonthlyPnLLoading = false,
  isExporting = false,
  exportError = null,
  selectedWallet,
  availableWallets,
  onWalletChange,
  showWalletSelector,
}: AnalyticsViewProps): ReactElement {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <AnalyticsHeader
        onExport={onExport}
        isExporting={isExporting}
        exportError={exportError}
        selectedWallet={selectedWallet}
        availableWallets={availableWallets}
        onWalletChange={onWalletChange}
        showWalletSelector={showWalletSelector}
      />

      {/* Primary Chart Section with Tabs */}
      <ChartSection
        data={data}
        selectedPeriod={selectedPeriod}
        activeChartTab={activeChartTab}
        onPeriodChange={onPeriodChange}
        onChartTabChange={onChartTabChange}
        isLoading={isLoading}
      />

      {/* Key Metrics Grid */}
      <KeyMetricsGrid metrics={data.keyMetrics} isLoading={isLoading} />

      {/* Additional Metrics Row */}
      <AdditionalMetricsGrid metrics={data.keyMetrics} isLoading={isLoading} />

      {/* PnL Heatmap - Uses independent loading state for yield/daily endpoint */}
      <MonthlyPnLHeatmap
        monthlyPnL={data.monthlyPnL}
        isLoading={isMonthlyPnLLoading}
      />
    </div>
  );
}
