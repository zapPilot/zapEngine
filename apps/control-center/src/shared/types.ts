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
  engagementRate: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  followersGained: number | null;
  averageViewDurationSec: number | null;
  averageViewPercentage: number | null;
}

export interface SocialDecision {
  platform: string;
  evidenceSamples: number;
  confidence: 'low' | 'medium' | 'high';
  preferredHookTypes: string[];
  preferredHashtags: string[];
  avoidHashtags: string[];
  bestTimeWindow: string | null;
  bestTopic: string | null;
  topExample: string | null;
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
  decisions: SocialDecision[];
  episodes: SocialEpisodeSummary[];
}

export interface ProductHealthResponse {
  registeredUsers: number | null;
  verifiedWallets: number | null;
  portfolioUsers: number | null;
  wau: number | null;
  mau: number | null;
  observedPortfolioUsd: number | null;
  portfolioFresh24h: number | null;
  portfolioFresh7d: number | null;
  top1PortfolioShare: number | null;
  top3PortfolioShare: number | null;
}

export interface OverviewResponse {
  generatedAt: string;
  accruedCostUsd: number | null;
  projectedCostUsd: number | null;
  cashInvoiceSpendUsd: number | null;
  aumUsd: number | null;
  activeAccounts: number | null;
  socialReach: number | null;
  product: ProductHealthResponse;
  providers: CostProviderResult[];
  social: SocialPerformanceResponse;
}
