/**
 * Analytics Validation Utilities
 * Pure functions for validating analytics data structures
 *
 * Architecture: Pure validation logic separated from service layer
 * No side effects, only data structure validation
 */

import type { AnalyticsData } from "@/types/analytics";

/**
 * Validate analytics data for export
 *
 * Ensures data has minimum required fields for CSV export operations
 *
 * @param data - Analytics data to validate
 * @returns True if data is valid and complete, false otherwise
 *
 * @example
 * const data = await fetchAnalyticsData();
 * if (validateExportData(data)) {
 *   // Safe to export
 *   exportAnalyticsToCSV(data);
 * } else {
 *   // Handle incomplete data
 *   showError('Insufficient data for export');
 * }
 */
export function validateExportData(data: AnalyticsData | null): boolean {
  if (!data) return false;

  // Check for required chart data
  if (
    !data.performanceChart?.points ||
    data.performanceChart.points.length === 0
  ) {
    return false;
  }

  if (!data.drawdownChart?.points || data.drawdownChart.points.length === 0) {
    return false;
  }

  // Check for required key metrics
  if (!data.keyMetrics) {
    return false;
  }

  const requiredMetrics = [
    "timeWeightedReturn",
    "maxDrawdown",
    "sharpe",
    "winRate",
    "volatility",
  ];

  for (const metric of requiredMetrics) {
    if (!data.keyMetrics[metric as keyof typeof data.keyMetrics]) {
      return false;
    }
  }

  // Monthly PnL is optional but check if exists
  if (!data.monthlyPnL) {
    return false;
  }

  return true;
}
