import type { AnalyticsTimePeriod } from "@/types/analytics";

export const ANALYTICS_TIME_PERIODS: AnalyticsTimePeriod[] = [
  { key: "1M", days: 30, label: "1M" },
  { key: "3M", days: 90, label: "3M" },
  { key: "6M", days: 180, label: "6M" },
  { key: "1Y", days: 365, label: "1Y" },
  { key: "ALL", days: 730, label: "ALL" },
];

export const DEFAULT_ANALYTICS_PERIOD: AnalyticsTimePeriod =
  ANALYTICS_TIME_PERIODS.find(period => period.key === "1Y") ??
    ANALYTICS_TIME_PERIODS[0] ?? { key: "1M", days: 30, label: "1M" };
