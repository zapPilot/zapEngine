export interface ROIData {
  value: number;
  data_points: number;
  start_balance: number;
  days_spanned: number;
}

export interface PortfolioROI {
  /**
   * ROI data keyed by period identifier from analytics-engine
   * Expected keys: 'roi_3d', 'roi_7d', 'roi_14d', 'roi_30d', 'roi_60d', 'roi_180d', 'roi_365d'
   * @see analytics-engine/src/services/roi_calculator.py:ROI_PERIODS
   */
  windows: Record<string, ROIData>;
  recommended_roi: number;
  recommended_period: string;
  recommended_yearly_roi: number;
  estimated_yearly_pnl_usd: number;
}

export interface CategoryAllocation {
  total_value: number;
  percentage_of_portfolio: number;
  wallet_tokens_value: number;
  other_sources_value: number;
}

export interface PortfolioAllocation {
  btc: CategoryAllocation;
  eth: CategoryAllocation;
  stablecoins: CategoryAllocation;
  others: CategoryAllocation;
}

export interface WalletTokenSummary {
  total_value_usd: number;
  token_count: number;
  apr_30d: number;
}

export interface CategorySummaryDebt {
  btc: number;
  eth: number;
  stablecoins: number;
  others: number;
}

export interface PoolDetail {
  protocol: string;
  pool_name: string;
  total_value_usd: number;
  apr: number;
  category: string;
  [key: string]: unknown;
}

export interface PortfolioResponse {
  total_assets_usd: number;
  total_debt_usd: number;
  total_net_usd: number;
  weighted_apr: number;
  estimated_monthly_income: number;
  wallet_count: number;
  last_updated: string | null;
  portfolio_allocation: PortfolioAllocation;
  wallet_token_summary: WalletTokenSummary;
  portfolio_roi: PortfolioROI;
  category_summary_debt: CategorySummaryDebt;
  pool_details: PoolDetail[];
}
