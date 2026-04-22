/**
 * Analytics View Container
 *
 * Container component managing state and data fetching for analytics view
 * Follows Container/Presentational pattern
 */

import { type ReactElement, useEffect, useMemo, useState } from 'react';

import { useAnalyticsData } from '@/hooks/queries/analytics/useAnalyticsData';
import { useUserById } from '@/hooks/queries/wallet/useUserQuery';
import { exportAnalyticsToCSV } from '@/services';
import type {
  AnalyticsData,
  AnalyticsTimePeriod,
  MetricData,
  WalletFilter,
  WalletOption,
} from '@/types/analytics';

import { AnalyticsView } from './AnalyticsView';
import { AnalyticsErrorState } from './components/AnalyticsErrorState';
import { DEFAULT_ANALYTICS_PERIOD } from './constants';

/**
 * Create empty metric data for fallback state
 */
function createEmptyMetric(label: string): MetricData {
  return {
    value: '0',
    subValue: label,
    trend: 'neutral',
  };
}

/**
 * Create empty analytics data structure for fallback state
 * Used when API data is not yet available during loading
 */
function createEmptyAnalyticsData(): AnalyticsData {
  return {
    performanceChart: {
      points: [],
      startDate: '',
      endDate: '',
    },
    drawdownChart: {
      points: [],
      maxDrawdown: 0,
      maxDrawdownDate: '',
    },
    keyMetrics: {
      timeWeightedReturn: createEmptyMetric('Time-Weighted Return'),
      maxDrawdown: createEmptyMetric('Max Drawdown'),
      sharpe: createEmptyMetric('Sharpe Ratio'),
      winRate: createEmptyMetric('Win Rate'),
      volatility: createEmptyMetric('Volatility'),
    },
    monthlyPnL: [],
  };
}

/**
 * Analytics View Container Props
 */
interface AnalyticsViewContainerProps {
  userId: string;
}

/**
 * Time period definitions
 */
export function AnalyticsViewContainer({
  userId,
}: AnalyticsViewContainerProps): ReactElement {
  // Find default period (1Y)
  const defaultPeriod: AnalyticsTimePeriod = DEFAULT_ANALYTICS_PERIOD;

  // State management
  const [selectedPeriod, setSelectedPeriod] =
    useState<AnalyticsTimePeriod>(defaultPeriod);
  const [activeChartTab, setActiveChartTab] = useState<
    'performance' | 'drawdown'
  >('performance');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [selectedWallet, setSelectedWallet] = useState<WalletFilter>(null);

  const { data: bundleOwnerInfo } = useUserById(userId);
  const availableWallets: WalletOption[] = useMemo(() => {
    const additionalWallets = bundleOwnerInfo?.additionalWallets;
    if (!additionalWallets) {
      return [];
    }

    return additionalWallets.map((wallet) => ({
      address: wallet.wallet_address,
      label: wallet.label,
    }));
  }, [bundleOwnerInfo?.additionalWallets]);

  // Always show wallet selector (even for single-wallet users)
  // This allows users to see which wallet is associated with the bundle
  const showWalletSelector = true;

  // Auto-reset to "All Wallets" if selected wallet is removed from bundle
  useEffect(() => {
    if (
      selectedWallet &&
      !availableWallets.find((w) => w.address === selectedWallet)
    ) {
      setSelectedWallet(null);
    }
  }, [availableWallets, selectedWallet]);

  // Data fetching with period change detection and wallet filter
  const { data, isLoading, isMonthlyPnLLoading, error, refetch } =
    useAnalyticsData(userId, selectedPeriod, selectedWallet);

  // Handlers
  const handlePeriodChange = (period: AnalyticsTimePeriod) => {
    setSelectedPeriod(period);
  };

  const handleChartTabChange = (tab: 'performance' | 'drawdown') => {
    setActiveChartTab(tab);
  };

  const handleWalletChange = (wallet: WalletFilter) => {
    setSelectedWallet(wallet);
  };

  const handleExport = async () => {
    if (!data) {
      setExportError('No data available to export');
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      // Pass wallet filter to export function
      const result = await exportAnalyticsToCSV(
        userId,
        data,
        selectedPeriod,
        selectedWallet,
      );
      if (!result.success) {
        setExportError(result.error || 'Export failed');
      }
    } catch {
      setExportError('An unexpected error occurred');
    } finally {
      setIsExporting(false);
    }
  };

  if (error && !data) {
    return <AnalyticsErrorState error={error} onRetry={refetch} />;
  }

  // Provide fallback empty data structure to ensure components always render
  // Component-level skeletons will be shown via isLoading prop
  const analyticsData: AnalyticsData = data ?? createEmptyAnalyticsData();

  return (
    <AnalyticsView
      data={analyticsData}
      selectedPeriod={selectedPeriod}
      activeChartTab={activeChartTab}
      onPeriodChange={handlePeriodChange}
      onChartTabChange={handleChartTabChange}
      onExport={handleExport}
      isLoading={isLoading}
      isMonthlyPnLLoading={isMonthlyPnLLoading}
      isExporting={isExporting}
      exportError={exportError}
      selectedWallet={selectedWallet}
      availableWallets={availableWallets}
      onWalletChange={handleWalletChange}
      showWalletSelector={showWalletSelector}
    />
  );
}
