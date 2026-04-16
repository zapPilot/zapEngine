/**
 * Services Public API
 *
 * Centralized barrel export for all application services.
 * Import services from this file for cleaner imports:
 *
 * @example
 * ```typescript
 * import { connectWallet, getUserProfile } from '@/services';
 * import { getPortfolioDashboard } from '@/services';
 * ```
 */

// ============================================================================
// PRODUCTION SERVICES
// ============================================================================

// Account & User Management
export {
  AccountServiceError,
  addWalletToBundle,
  connectWallet,
  deleteUser,
  type EtlJobResponse,
  type EtlJobStatus,
  getEtlJobStatus,
  getUserProfile,
  getUserWallets,
  removeUserEmail,
  removeWalletFromBundle,
  triggerWalletDataFetch,
  updateUserEmail,
  updateWalletLabel,
} from "./accountService";

// Analytics & Portfolio Data
export {
  type BorrowingPosition,
  type BorrowingPositionsResponse,
  type BorrowingSummary,
  type DailyYieldReturnsResponse,
  type DashboardWindowParams,
  getBorrowingPositions,
  getDailyYieldReturns,
  getLandingPagePortfolioData,
  getMarketDashboardData,
  getPortfolioDashboard,
  type LandingPageResponse,
  type MarketDashboardPoint,
  type MarketDashboardResponse,
  type PoolDetail,
  type RiskMetrics,
  type UnifiedDashboardResponse,
} from "./analyticsService";

// Bundle Sharing
export {
  type BundleUser,
  generateBundleUrl,
  getBundleUser,
  isOwnBundle,
} from "./bundleService";

// Market Data
export {
  type BtcPriceHistoryResponse,
  type BtcPriceSnapshot,
  getBtcPriceHistory,
} from "./btcPriceService";

// Sentiment & Regime Analysis
export {
  DEFAULT_REGIME_HISTORY,
  fetchRegimeHistory,
  type RegimeHistoryData,
} from "./regimeHistoryService";
export {
  fetchMarketSentiment,
  type MarketSentimentData,
} from "./sentimentService";

// Analytics Export
export { exportAnalyticsToCSV } from "./analyticsExportService";

// Backtesting
export { getBacktestingStrategiesV3, runBacktest } from "./backtestingService";

// Strategy Suggestions
export {
  type BacktestDefaults,
  type DailySuggestionResponse,
  getDailySuggestion,
  getStrategyConfigs,
  type StrategyConfigsResponse,
  type StrategyPreset,
} from "./strategyService";

// Strategy Admin
export {
  createStrategyConfig,
  getStrategyAdminConfig,
  getStrategyAdminConfigs,
  setDefaultStrategyConfig,
  updateStrategyConfig,
} from "./strategyAdminService";

// Telegram Integration
export {
  disconnectTelegram,
  getTelegramStatus,
  requestTelegramToken,
  type TelegramDisconnectResponse,
  type TelegramStatus,
  type TelegramTokenResponse,
} from "./telegramService";

// ============================================================================
// MOCK SERVICES (Development/Testing Only)
// ============================================================================

// New explicit mock exports (preferred)
export * as chainServiceMock from "./chainService.mock";
export * as transactionServiceMock from "./transactionService.mock";
