import type {
  CostProvider,
  CostSnapshot,
  CostType,
} from '@zapengine/cost-observability';

export type ProviderStatus = 'ok' | 'unconfigured' | 'error';

export interface CostProviderResult {
  provider: CostProvider;
  label: string;
  status: ProviderStatus;
  costType: CostType;
  snapshot: CostSnapshot | null;
  message: string | null;
}

export type CostTransactionKind =
  | 'subscription'
  | 'top_up'
  | 'invoice'
  | 'adjustment';

export interface CostHistoryPoint {
  date: string;
  accruedCostUsd: number | null;
}

export interface MonthlyCostPoint {
  month: string;
  accruedCostUsd: number | null;
}

export interface CostHistoryResponse {
  currentMonthDaily: CostHistoryPoint[];
  monthlyTotals: MonthlyCostPoint[];
  cashSpendUsd: number | null;
}

export interface SocialAccountSummary {
  platform: string;
  followers: number | null;
  capturedAt: string;
}

export interface SocialPlatformPerformance {
  platform: string;
  postUrl: string | null;
  views: number | null;
  impressions: number | null;
  engagementRate: number | null;
  fiveSecondRetentionRate: number | null;
  averageViewDurationSec: number | null;
  coverCtr: number | null;
  technicalQualityScore: number | null;
}

export interface SocialEpisodeSummary {
  episodeId: string;
  title: string;
  totalViews: number | null;
  totalImpressions: number | null;
  platforms: SocialPlatformPerformance[];
}

export interface SocialPerformanceResponse {
  status: ProviderStatus;
  message: string | null;
  window: 'latest' | '24h' | '72h' | '7d';
  generatedAt: string;
  accounts: SocialAccountSummary[];
  episodes: SocialEpisodeSummary[];
}

export interface OverviewResponse {
  generatedAt: string;
  accruedCostUsd: number | null;
  projectedCostUsd: number | null;
  cashInvoiceSpendUsd: number | null;
  aumUsd: number | null;
  activeAccounts: number | null;
  socialReach: number | null;
  providers: CostProviderResult[];
  social: SocialPerformanceResponse;
}
