export interface CategoryBreakdown {
  name: string;
  value: number;
  percentage?: number;
  [key: string]: unknown;
}

export interface DailyTrendDataPoint {
  date: string;
  total_value_usd: number;
  change_percentage?: number;
  categories?: CategoryBreakdown[];
  protocols?: string[];
  by_protocol?: Record<string, number>;
  by_chain?: Record<string, number>;
}

export interface PortfolioTrendResponse {
  daily_values?: DailyTrendDataPoint[];
}
