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

/**
 * The flyctl collector's headline number: what every currently-running Machine
 * would cost if it stayed up for the whole month at list price. Fly bills per
 * second and publishes no billing API, so this is a ceiling on compute, never
 * an expected invoice — it lives in `usage` and must never be written to
 * `accruedCostUsd` or `projectedCostUsd`.
 */
export const FLY_RUN_RATE_USAGE_KEY = 'compute_run_rate_monthly';

/**
 * Usage keys owned by the flyctl collector. A carried-forward manual snapshot
 * strips them rather than re-stamping yesterday's Machine counts with today's
 * `fetchedAt`, which would present stale fleet state as a current reading.
 */
export const FLY_COLLECTOR_USAGE_KEYS = [
  FLY_RUN_RATE_USAGE_KEY,
  'running_machines',
  'stopped_machines',
  'apps',
  'unsupported_running_machines',
] as const;

/**
 * One provider's contribution to a single day's accrued cost. The daily chart
 * total collapses providers, so this keeps the split the tooltip needs —
 * including rows whose cost is unknown (`accruedCostUsd: null`), because
 * naming an excluded provider is the whole point of showing the basis.
 */
export interface CostHistoryProviderPoint {
  provider: CostProvider;
  label: string;
  accruedCostUsd: number | null;
  costType: CostType;
  source: CostSnapshot['source'];
  /**
   * When an operator-recorded figure was read, carried per day rather than
   * taken from the provider's current snapshot: a manual amount is a floor
   * from the moment it was read, and dating an older day with the newest
   * reading would claim knowledge that day never had.
   */
  periodEnd: string;
}

export interface CostHistoryPoint {
  date: string;
  accruedCostUsd: number | null;
  providers: CostHistoryProviderPoint[];
}

export interface MonthlyCostPoint {
  month: string;
  accruedCostUsd: number | null;
}

export interface ProviderMonthCost {
  provider: CostProvider;
  accruedCostUsd: number | null;
}

export interface CostHistoryResponse {
  currentMonthDaily: CostHistoryPoint[];
  monthlyTotals: MonthlyCostPoint[];
  cashSpendUsd: number | null;
  /** Every provider's total for the calendar month before the current one. */
  previousMonthByProvider: ProviderMonthCost[];
}

export interface PodcastCostBreakdown {
  label: string;
  costUsd: number;
  operations: number;
}

export interface PodcastEpisodeCostSummary {
  episodeId: string;
  title: string | null;
  lastRunAt: string;
  totalCostUsd: number;
  podcastCostUsd: number;
  videoCostUsd: number;
  /** Sunk cost from failed pipeline attempts; already included in total cost. */
  retryWasteUsd: number;
  runCount: number;
  failedRuns: number;
  unpricedStages: number;
  breakdown: PodcastCostBreakdown[];
}

export interface PodcastCostResponse {
  generatedAt: string;
  status: ProviderStatus;
  message: string | null;
  episodes: PodcastEpisodeCostSummary[];
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
  /** Sample-count coverage only; this is not statistical significance. */
  confidence: 'low' | 'medium' | 'high';
  preferredHookTypes: string[];
  preferredHashtags: string[];
  avoidHashtags: string[];
  bestTopic: string | null;
  bestTopicSamples: number | null;
  bestTopicMedian24hViews: number | null;
  platformMedian24hViews: number | null;
  bestTopicLiftVsPlatformMedian: number | null;
  publishSlotsJst: string | null;
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

export type SocialGrowthBasis = 'estimated' | 'exact';

export interface SocialGrowthLane {
  languageCode: string;
  postCount7d: number;
  medianReach24h: number | null;
  followersGained7d: number | null;
  followersPer1kReach: number | null;
  basis: SocialGrowthBasis;
}

export interface SocialGrowthPlatform {
  platform: string;
  followersNow: number | null;
  followersDelta24h: number | null;
  followersDelta7d: number | null;
  exactSubscribersGained7d: number | null;
  lanes: SocialGrowthLane[];
}

export type SocialExperimentStatus =
  | 'collecting'
  | 'provisional'
  | 'eligible'
  | 'paired-cohort';

export interface SocialExperimentArm {
  variant: string;
  samples24h: number;
  status: Exclude<SocialExperimentStatus, 'paired-cohort'>;
  medianReach24h: number | null;
  meanReach24h: number | null;
  medianEngagementRate: number | null;
  followersAttributed: number | null;
  followersPer1kReach: number | null;
  basis: SocialGrowthBasis;
}

export interface SocialExperimentSummary {
  experimentKey: string;
  kind: 'language' | 'packaging';
  paired: boolean;
  status: SocialExperimentStatus;
  arms: SocialExperimentArm[];
}

export interface SocialGrowthAttributionShare {
  postId: string;
  share: number;
  followersEstimated: number;
  basis: 'estimated';
}

export interface SocialGrowthInterval {
  platform: string;
  startAt: string;
  endAt: string;
  netDelta: number;
  unattributed: number;
  posts: SocialGrowthAttributionShare[];
  basis: 'estimated';
}

export interface SocialGrowthResponse {
  status: ProviderStatus;
  message: string | null;
  generatedAt: string;
  platforms: SocialGrowthPlatform[];
  experiments: SocialExperimentSummary[];
  attribution: SocialGrowthInterval[];
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
  /**
   * North star: users with account-engine activity in the last 7 days AND at
   * least one wallet whose portfolio refreshed in the last 7 days. Grows only
   * when the product is used *and* the pipeline that feeds it is working.
   */
  activePortfolios7d: number | null;
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

// ---------------------------------------------------------------------------
// Operational signals
// ---------------------------------------------------------------------------

/**
 * One vocabulary for "is anything wrong", shared by every source the Control
 * Center reads and by the `ops:status` CLI an agent runs.
 *
 * `unknown` is deliberately distinct from `healthy`: a source with no
 * credentials configured has not told us it is fine, and collapsing the two
 * is how an unconfigured integration reads as a green light.
 */
export type OperationalStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

/**
 * Every domain the Control Center reports on, in reading order. The type is
 * derived from the list rather than declared beside it so a new domain cannot
 * be added to one and forgotten in the other.
 */
export const OPERATIONS_DOMAINS = [
  'customers',
  'product',
  'costs',
  'social',
  'jobs',
  'infra',
  'errors',
  'analytics',
] as const;

export type OperationsDomain = (typeof OPERATIONS_DOMAINS)[number];

export type OperationsSource =
  | 'customer-economics'
  | 'product-health'
  | 'cost-ledger'
  | 'social-queue'
  | 'social-daemon'
  | 'github-actions'
  | 'fly'
  | 'sentry'
  | 'posthog';

export interface OperationalSignal {
  /**
   * `${source}:${kind}/${key}` — stable across runs for the same underlying
   * condition, so a reader can tell "still broken" from "broken again".
   */
  fingerprint: string;
  source: OperationsSource;
  domain: OperationsDomain;
  status: OperationalStatus;
  title: string;
  detail: string | null;
  /** Scalars only: the priority engine reads numbers out of this by key. */
  evidence: Record<string, string | number | boolean | null>;
  observedAt: string;
  url: string | null;
}

export interface OperationalPriority {
  signal: OperationalSignal;
  score: number;
  reasons: string[];
}

export interface OperationsDomainSummary {
  domain: OperationsDomain;
  status: OperationalStatus;
  signalCount: number;
}

export interface OperationsResponse {
  generatedAt: string;
  status: OperationalStatus;
  /** All eight domains, always — an absent domain would read as "fine". */
  domains: OperationsDomainSummary[];
  priorities: OperationalPriority[];
  signals: OperationalSignal[];
}

export interface OperationsSocialJob {
  episodeId: string;
  platform: string;
  languageCode: string | null;
  status: string;
  scheduledAt: string;
  nextAttemptAt: string;
  attemptCount: number;
  overdueMinutes: number | null;
  attemptsExhausted: boolean;
}

export interface OperationsSocialDaemon {
  status: OperationalStatus;
  owner: string | null;
  daemonVersion: string | null;
  firstStartedAt: string | null;
  lastTickStartedAt: string | null;
  lastTickCompletedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  staleMinutes: number | null;
}

export interface OperationsSocialResponse {
  generatedAt: string;
  daemon: OperationsSocialDaemon;
  jobs: OperationsSocialJob[];
  /**
   * `social_waiting_media` yields one row per (episode, platform, language)
   * lane, so a single unrendered localization contributes several. Counting
   * them as episodes would overstate how much is stuck.
   */
  waitingMediaLanes: number | null;
  /**
   * Queue rows the reader could not parse. A dropped row is a lane the panel
   * cannot see, so the count travels with the response rather than being
   * swallowed: an all-dropped read is reported as a source failure, and a
   * partial one still degrades the queue signal.
   */
  invalidJobRows: number;
  message: string | null;
}

// ---------------------------------------------------------------------------
// Customer economics
// ---------------------------------------------------------------------------

/**
 * Scheduling policy, not commercial entitlement. `planCode` says what a user
 * bought; the tier says how often we spend money on them. They start coupled
 * (`vip` -> `priority`) and are pulled apart by an operator override.
 */
export type ServiceTier = 'priority' | 'standard' | 'paused';

export type CostBasis = 'measured' | 'allocated_estimate';

export interface CustomerWalletSummary {
  wallet: string;
  lastPortfolioUpdateAt: string | null;
  dueForRefresh: boolean;
}

export interface CustomerRecord {
  userId: string;
  email: string | null;
  planCode: string;
  defaultTier: ServiceTier;
  overrideTier: ServiceTier | null;
  overrideReason: string | null;
  overrideExpiresAt: string | null;
  effectiveTier: ServiceTier;
  refreshIntervalHours: number | null;
  /**
   * Last request to an account-engine `/users/:userId*` route, debounced to an
   * hour. It is "opened the dashboard", not "used the product" — nothing else
   * writes it.
   */
  lastActivityAt: string | null;
  inactiveDays: number | null;
  aumUsd: number | null;
  wallets: CustomerWalletSummary[];
  /**
   * Age of the account's *freshest* wallet. A display figure only — it answers
   * "is this customer looking at current numbers", which one current wallet is
   * enough for. Never use it to decide whether anything is wrong.
   */
  portfolioStaleHours: number | null;
  /**
   * Age of the account's stalest wallet, counting each portfolio provider
   * separately. This is the one the freshness signal judges on: a wallet whose
   * Hyperliquid slice stopped a week ago is broken even while its DeBank slice
   * refreshes every morning.
   */
  portfolioWorstStaleHours: number | null;
  /**
   * Wallets with at least one provider that has never landed data. They have
   * no age at all, so they cannot be compared against a staleness threshold —
   * counting them separately is what stops them from passing one.
   */
  neverRefreshedWallets: number;
  dueForRefresh: boolean;
  requestCount30d: number;
  /**
   * DeBank prices an account, not an endpoint, so this is the user's share of
   * the account invoice by request volume — never a measured amount. `costBasis`
   * carries that distinction to the UI.
   */
  attributedCostUsd30d: number | null;
  costBasis: CostBasis | null;
  /** No billing system exists in this repository. Always null: never inferred. */
  revenueUsd: number | null;
}

export interface CustomerEconomicsSummary {
  totalCustomers: number;
  priorityUsers: number;
  standardUsers: number;
  pausedUsers: number;
  activeLast7d: number;
  /** Priority accounts that have not opened the app in 30 days. Pure waste. */
  inactiveButPriority: number;
  aumUsd: number | null;
  attributedCostUsd30d: number | null;
  revenueUsd: number | null;
}

export interface CustomerEconomicsResponse {
  generatedAt: string;
  status: ProviderStatus;
  message: string | null;
  summary: CustomerEconomicsSummary;
  users: CustomerRecord[];
}
