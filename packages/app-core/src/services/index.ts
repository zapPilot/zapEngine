/**
 * Services Public API
 *
 * Centralized barrel export for all application services.
 * Import services from this file for cleaner imports:
 *
 * @example
 * ```typescript
 * import { connectWallet, getUserProfile } from '@core/services';
 * import { getPortfolioDashboard } from '@core/services';
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
} from './accountService';

// Wallet Management
export {
  addWallet,
  loadWallets,
  removeWallet,
  unsubscribeUserEmail,
  updateManagedWalletLabel,
  updateUserEmailSubscription,
} from './walletService';

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
} from './analyticsService';

// Bundle Sharing
export {
  type BundleUser,
  generateBundleUrl,
  getBundleUser,
  isOwnBundle,
} from './bundleService';

// Market Data
export {
  type BtcPriceHistoryResponse,
  type BtcPriceSnapshot,
  getBtcPriceHistory,
} from './btcPriceService';

// Sentiment & Regime Analysis
export {
  DEFAULT_REGIME_HISTORY,
  fetchRegimeHistory,
  type RegimeHistoryData,
} from './regimeHistoryService';
export {
  fetchMarketSentiment,
  type MarketSentimentData,
} from './sentimentService';

// Analytics Export
export { exportAnalyticsToCSV } from './analyticsExportService';

// Backtesting
export { getBacktestingStrategiesV3, runBacktest } from './backtestingService';

// Strategy Suggestions
export {
  type BacktestDefaults,
  type DailySuggestionResponse,
  getDailySuggestion,
  getStrategyConfigs,
  type StrategyConfigsResponse,
  type StrategyPreset,
} from './strategyService';

// Deposit & withdraw planning
export {
  getDepositPlan,
  getGmxDepositPlan,
  getWithdrawPlan,
} from './planOrchestrationService';

// Moralis wallet POC (desktop/web clients; proxy before production)
export {
  getMoralisWalletHistory,
  getMoralisWalletTokenBalances,
  getSupportedMoralisWalletSymbol,
  MORALIS_SUPPORTED_TOKEN_ADDRESSES_BY_CHAIN,
  MORALIS_WALLET_CHAINS,
  type MoralisChainBalances,
  type MoralisChainHistory,
  type MoralisSupportedWalletSymbol,
  type MoralisWalletChain,
  type MoralisWalletHistoryEvent,
  type MoralisWalletHistoryResponse,
  type MoralisWalletTokenBalance,
  type MoralisWalletTokenBalancesResponse,
  type MoralisWalletTransfer,
} from './moralisWalletService';

// Alchemy wallet token balances (desktop/web clients; proxy before production)
export {
  ALCHEMY_WALLET_CHAINS,
  type AlchemyChainBalances,
  type AlchemySupportedWalletSymbol,
  type AlchemyWalletChain,
  type AlchemyWalletTokenBalance,
  type AlchemyWalletTokenBalancesResponse,
  getAlchemyWalletTokenBalances,
} from './alchemyWalletService';

// Provider-neutral supported wallet token catalog
export {
  getSupportedWalletTokenDefinition,
  getSupportedWalletTokenSymbol,
  normalizeSupportedWalletTokenSymbol,
  SUPPORTED_WALLET_TOKEN_ADDRESSES_BY_CHAIN,
  SUPPORTED_WALLET_TOKEN_DEFINITIONS,
  type SupportedWalletErc20Symbol,
  supportedWalletTokenAddresses,
  type SupportedWalletTokenSymbol,
  supportedWalletTokenSymbolForAddress,
  WALLET_TOKEN_CHAINS,
  type WalletTokenChain,
  type WalletTokenDefinition,
} from './walletTokenCatalog';

// On-chain token balances (real wallet balance + LI.FI USD valuation)
export {
  getOnChainTokenBalance,
  NATIVE_TOKEN_ADDRESS,
  type OnChainTokenBalance,
} from './tokenBalanceService';

// Strategy Admin
export {
  createStrategyConfig,
  getStrategyAdminConfig,
  getStrategyAdminConfigs,
  setDefaultStrategyConfig,
  updateStrategyConfig,
} from './strategyAdminService';

// Telegram Integration
export {
  disconnectTelegram,
  getTelegramStatus,
  requestTelegramToken,
  type TelegramDisconnectResponse,
  type TelegramStatus,
  type TelegramTokenResponse,
} from './telegramService';

// ============================================================================
// MOCK SERVICES (Development/Testing Only)
// ============================================================================

// New explicit mock exports (preferred)
export * as chainServiceMock from './chainService.mock';
export * as transactionServiceMock from './transactionService.mock';
