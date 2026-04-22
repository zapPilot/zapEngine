import type { UnifiedDashboardResponse } from '@/services';
import type { MetricData } from '@/types/analytics';

/**
 * Create placeholder metric for missing data
 */
export function createPlaceholderMetric(
  value: string,
  subValue: string,
): MetricData {
  return {
    value,
    subValue,
    trend: 'neutral',
  };
}

/**
 * Get Sharpe ratio percentile (mock calculation)
 */
export function getSharpePercentile(sharpe: number): number {
  if (sharpe > 3) return 1;
  if (sharpe > 2) return 5;
  if (sharpe > 1.5) return 10;
  if (sharpe > 1) return 25;
  return 50;
}

interface DrawdownAnalysis {
  enhanced?: {
    summary?: {
      max_drawdown_pct?: number;
      max_drawdown_date?: string;
      recovery_days?: number;
    };
  };
  underwater_recovery?: {
    underwater_data?: {
      drawdown_pct?: number;
      date?: string;
    }[];
  };
}

interface DrawdownSummary {
  max_drawdown_pct?: number;
  max_drawdown_date?: string;
  recovery_days?: number;
}

interface UnderwaterDataPoint {
  drawdown_pct?: number;
  date?: string;
}

interface DrawdownSummaryExtraction {
  maxDrawdownPct: number;
  maxDrawdownDate: string;
  recoveryDays: number;
  underwaterData: UnderwaterDataPoint[];
}

function getDrawdownAnalysis(
  dashboard: UnifiedDashboardResponse | undefined,
): DrawdownAnalysis | undefined {
  return dashboard?.drawdown_analysis as unknown as
    | DrawdownAnalysis
    | undefined;
}

function getDrawdownSummary(
  drawdownAnalysis: DrawdownAnalysis | undefined,
): DrawdownSummary | undefined {
  return drawdownAnalysis?.enhanced?.summary;
}

function getUnderwaterData(
  drawdownAnalysis: DrawdownAnalysis | undefined,
): UnderwaterDataPoint[] {
  return drawdownAnalysis?.underwater_recovery?.underwater_data ?? [];
}

/**
 * Safely extract drawdown summary data from response
 */
export function extractDrawdownSummary(
  dashboard: UnifiedDashboardResponse | undefined,
): DrawdownSummaryExtraction {
  const drawdownAnalysis = getDrawdownAnalysis(dashboard);
  const summary = getDrawdownSummary(drawdownAnalysis);

  return {
    maxDrawdownPct: summary?.max_drawdown_pct ?? 0,
    maxDrawdownDate: summary?.max_drawdown_date ?? new Date().toISOString(),
    recoveryDays: summary?.recovery_days ?? 0,
    underwaterData: getUnderwaterData(drawdownAnalysis),
  };
}
