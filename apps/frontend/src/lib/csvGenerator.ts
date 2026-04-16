/**
 * CSV Generator Utility
 * RFC 4180 compliant CSV generation for analytics export
 */

import type { WalletFilter } from "@/types/analytics";
import type { CsvGenerationOptions, ExportMetadata } from "@/types/export";
import { formatAddress } from "@/utils/formatters";

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

const DEFAULT_OPTIONS: Required<CsvGenerationOptions> = {
  includeBOM: true,
  lineEnding: "\r\n",
  delimiter: ",",
  quote: '"',
};

export function escapeCsvField(
  value: string | number | null | undefined,
  options: CsvGenerationOptions = {}
): string {
  const { delimiter = ",", quote = '"' } = { ...DEFAULT_OPTIONS, ...options };
  const stringValue = value?.toString() ?? "";

  return new RegExp(`[${delimiter}${quote}\\r\\n]`).test(stringValue)
    ? `${quote}${stringValue.replace(new RegExp(quote, "g"), quote + quote)}${quote}`
    : stringValue;
}

export function formatCsvRow(
  values: (string | number | null | undefined)[],
  options: CsvGenerationOptions = {}
): string {
  const { delimiter = "," } = { ...DEFAULT_OPTIONS, ...options };
  return values.map(v => escapeCsvField(v, options)).join(delimiter);
}

function buildSection(
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  options: CsvGenerationOptions = {}
): string[] {
  return [
    `=== ${title} ===`,
    formatCsvRow(headers, options),
    ...rows.map(row => formatCsvRow(row, options)),
    "",
  ];
}

// =============================================================================
// SECTION BUILDERS
// =============================================================================

export function buildHeaderSection(metadata: ExportMetadata): string[] {
  const { userId, timePeriod, data, timestamp, walletFilter } = metadata;

  const periodLabels: Record<string, string> = {
    "1M": "1M (30 days)",
    "3M": "3M (90 days)",
    "6M": "6M (180 days)",
    "1Y": "1Y (365 days)",
    ALL: "All (730 days)",
  };

  const walletFilterDisplay = walletFilter
    ? `Specific Wallet (${formatAddress(walletFilter)})`
    : "All Wallets (Bundle Aggregation)";

  return [
    "Portfolio Analytics Report",
    `Generated: ${timestamp.toISOString()}`,
    `User ID: ${userId}`,
    `Wallet Filter: ${walletFilterDisplay}`,
    `Time Period: ${periodLabels[timePeriod.key] || timePeriod.label}`,
    `Period: ${data.performanceChart.startDate} to ${data.performanceChart.endDate}`,
    "",
  ];
}

export function buildMetricsSection(metadata: ExportMetadata): string[] {
  const { keyMetrics } = metadata.data;

  const metrics = [
    { label: "Time-Weighted Return", data: keyMetrics.timeWeightedReturn },
    { label: "Max Drawdown", data: keyMetrics.maxDrawdown },
    { label: "Sharpe Ratio", data: keyMetrics.sharpe },
    { label: "Win Rate", data: keyMetrics.winRate },
    { label: "Volatility", data: keyMetrics.volatility },
    keyMetrics.sortino && { label: "Sortino Ratio", data: keyMetrics.sortino },
    keyMetrics.beta && { label: "Beta", data: keyMetrics.beta },
    keyMetrics.alpha && { label: "Alpha", data: keyMetrics.alpha },
  ].filter(Boolean) as {
    label: string;
    data: {
      value: string | number;
      subValue?: string | number;
      trend?: string;
    };
  }[];

  const rows = metrics.map(m => [
    m.label,
    m.data.value,
    m.data.subValue,
    m.data.trend,
  ]);

  return buildSection(
    "KEY METRICS",
    ["Metric", "Value", "Sub Value", "Trend"],
    rows
  );
}

export function buildPerformanceSection(metadata: ExportMetadata): string[] {
  const rows = metadata.data.performanceChart.points.map(point => [
    point.date,
    point.portfolioValue.toFixed(2),
    point.portfolio.toFixed(2),
  ]);

  return buildSection(
    "PERFORMANCE CHART DATA",
    ["Date", "Portfolio Value (USD)", "Normalized Portfolio"],
    rows
  );
}

export function buildDrawdownSection(metadata: ExportMetadata): string[] {
  const rows = metadata.data.drawdownChart.points.map(point => [
    point.date,
    point.value.toFixed(2),
    point.x.toFixed(2),
    point.value.toFixed(2),
  ]);

  return buildSection(
    "DRAWDOWN CHART DATA",
    ["Date", "Drawdown (%)", "Normalized X", "Normalized Y"],
    rows
  );
}

export function buildMonthlyPnLSection(metadata: ExportMetadata): string[] {
  const rows = metadata.data.monthlyPnL.map(item => [
    item.month,
    item.year?.toString() ?? "",
    item.value >= 0 ? `+${item.value.toFixed(1)}` : item.value.toFixed(1),
  ]);

  return buildSection("MONTHLY PNL", ["Month", "Year", "Return (%)"], rows);
}

export function buildFooterSection(): string[] {
  return ["Report Generated: Zap Pilot Analytics Engine v0.1.0"];
}

// =============================================================================
// MAIN EXPORTS
// =============================================================================

export function generateAnalyticsCSV(
  metadata: ExportMetadata,
  options: CsvGenerationOptions = {}
): string {
  const finalOptions = { ...DEFAULT_OPTIONS, ...options };
  const { lineEnding = "\r\n", includeBOM = true } = finalOptions;

  const sections = [
    ...buildHeaderSection(metadata),
    ...buildMetricsSection(metadata),
    ...buildPerformanceSection(metadata),
    ...buildDrawdownSection(metadata),
    ...buildMonthlyPnLSection(metadata),
    ...buildFooterSection(),
  ];

  const content = sections.join(lineEnding);
  return includeBOM ? "\uFEFF" + content : content;
}

export function generateExportFilename(
  userId: string,
  date: Date,
  walletFilter?: WalletFilter
): string {
  const shortAddress = formatAddress(userId);
  const dateStr = date.toISOString().split("T")[0];
  const suffix = walletFilter ? formatAddress(walletFilter) : "bundle";
  return `portfolio-analytics-${shortAddress}-${suffix}-${dateStr}.csv`;
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
