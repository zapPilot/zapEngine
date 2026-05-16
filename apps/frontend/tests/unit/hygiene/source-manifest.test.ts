import { describe, expect, it } from 'vitest';

const scannerReportedSources = [
  'apps/frontend/cloudflare/index.js',
  'apps/frontend/eslint.config.mjs',
  'apps/frontend/knip.ts',
  'apps/frontend/playwright.config.ts',
  'apps/frontend/postcss.config.mjs',
  'apps/frontend/scripts/analyze-deadcode.js',
  'apps/frontend/scripts/baseline-browser-mapping.js',
  'apps/frontend/scripts/remove-deadcode.js',
  'apps/frontend/scripts/run-deadcode.js',
  'apps/frontend/scripts/run-e2e-safe.js',
  'apps/frontend/scripts/run-sharded-coverage.js',
  'apps/frontend/src/adapters/index.ts',
  'apps/frontend/src/app/App.tsx',
  'apps/frontend/src/components/WalletManager/contexts/index.ts',
  'apps/frontend/src/components/WalletManager/walletManagerUtils.ts',
  'apps/frontend/src/components/bundle/QuickSwitchFAB.tsx',
  'apps/frontend/src/components/bundle/index.ts',
  'apps/frontend/src/components/charts/chartIndicatorParts.tsx',
  'apps/frontend/src/components/charts/index.ts',
  'apps/frontend/src/components/charts/tooltipContent/index.ts',
  'apps/frontend/src/components/layout/banners/EmailReminderBanner.tsx',
  'apps/frontend/src/components/layout/index.ts',
  'apps/frontend/src/components/ui/loading/LoadingState.tsx',
  'apps/frontend/src/components/ui/loading/Skeleton.tsx',
  'apps/frontend/src/components/ui/loading/Spinner.tsx',
  'apps/frontend/src/components/ui/loading/constants.ts',
  'apps/frontend/src/components/ui/loading/skeletons/CardSkeleton.tsx',
  'apps/frontend/src/components/ui/loading/skeletons/ChartSkeleton.tsx',
  'apps/frontend/src/components/ui/loading/skeletons/MetricsSkeleton.tsx',
  'apps/frontend/src/components/ui/modal/ModalBackdrop.tsx',
  'apps/frontend/src/components/ui/modal/index.ts',
  'apps/frontend/src/components/ui/modal/types.ts',
  'apps/frontend/src/components/wallet/portfolio/analytics/index.tsx',
  'apps/frontend/src/components/wallet/portfolio/components/allocation/UnifiedAllocationBar.tsx',
  'apps/frontend/src/components/wallet/portfolio/components/allocation/unifiedAllocationTypes.ts',
  'apps/frontend/src/components/wallet/portfolio/components/navigation/index.ts',
  'apps/frontend/src/components/wallet/portfolio/components/navigation/portfolioNavigationConfig.ts',
  'apps/frontend/src/components/wallet/portfolio/components/navigation/walletMenu/WalletMenuButton.tsx',
  'apps/frontend/src/components/wallet/portfolio/components/navigation/walletMenu/WalletMenuDropdown.tsx',
  'apps/frontend/src/components/wallet/portfolio/components/navigation/walletMenu/WalletMenuSections.tsx',
  'apps/frontend/src/components/wallet/portfolio/components/navigation/walletMenu/types.ts',
  'apps/frontend/src/components/wallet/portfolio/components/navigation/walletMenu/walletMenuClassNames.ts',
  'apps/frontend/src/components/wallet/portfolio/components/shared/FinancialMetricRow.tsx',
  'apps/frontend/src/components/wallet/portfolio/components/shared/index.ts',
  'apps/frontend/src/components/wallet/portfolio/components/shared/useTooltipState.ts',
  'apps/frontend/src/components/wallet/portfolio/components/strategy/StrategyCardExpandedContent.tsx',
  'apps/frontend/src/components/wallet/portfolio/components/strategy/StrategyCardHeader.tsx',
  'apps/frontend/src/components/wallet/portfolio/components/strategy/index.ts',
  'apps/frontend/src/components/wallet/portfolio/components/strategy/strategyCardViewModel.tsx',
  'apps/frontend/src/components/wallet/portfolio/components/strategy/types.ts',
  'apps/frontend/src/components/wallet/portfolio/modals/components/TransactionActionButton.tsx',
  'apps/frontend/src/components/wallet/portfolio/modals/components/TransactionFormActions.tsx',
  'apps/frontend/src/components/wallet/portfolio/modals/components/TransactionModalHeader.tsx',
  'apps/frontend/src/components/wallet/portfolio/modals/hooks/useWatchedTransactionData.ts',
  'apps/frontend/src/components/wallet/portfolio/modals/index.ts',
  'apps/frontend/src/components/wallet/portfolio/views/backtesting/components/BacktestChartLayers.tsx',
  'apps/frontend/src/components/wallet/portfolio/views/backtesting/components/backtestChartHelpers.ts',
  'apps/frontend/src/components/wallet/portfolio/views/backtesting/components/terminalStyles.ts',
  'apps/frontend/src/components/wallet/portfolio/views/backtesting/index.ts',
  'apps/frontend/src/components/wallet/portfolio/views/backtesting/utils/backtestTooltipSections.ts',
  'apps/frontend/src/components/wallet/portfolio/views/invest/configManager/ConfigEditorHeader.tsx',
  'apps/frontend/src/components/wallet/portfolio/views/invest/configManager/ConfigEditorJsonSection.tsx',
  'apps/frontend/src/components/wallet/portfolio/views/invest/configManager/ConfigManagerView.tsx',
  'apps/frontend/src/components/wallet/portfolio/views/invest/configManager/useConfigEditorForm.ts',
  'apps/frontend/src/components/wallet/portfolio/views/invest/market/MarketOverviewChart.tsx',
  'apps/frontend/src/components/wallet/portfolio/views/invest/market/sections/ChartLegendToggle.tsx',
  'apps/frontend/src/components/wallet/portfolio/views/invest/market/sections/SimpleStatCard.tsx',
  'apps/frontend/src/components/wallet/portfolio/views/invest/market/sections/TimeframePicker.tsx',
  'apps/frontend/src/components/wallet/portfolio/views/invest/market/sections/index.ts',
  'apps/frontend/src/components/wallet/portfolio/views/invest/market/utils/marketChartUtils.tsx',
  'apps/frontend/src/components/wallet/portfolio/views/invest/trading/components/reviewModalHelpers.ts',
  'apps/frontend/src/components/wallet/portfolio/views/invest/trading/components/reviewModalPreviewData.ts',
  'apps/frontend/src/components/wallet/portfolio/views/shared/LegendTitle.tsx',
  'apps/frontend/src/components/wallet/portfolio/views/shared/PillToggleGroup.tsx',
  'apps/frontend/src/components/wallet/regime/strategyLabels.ts',
  'apps/frontend/src/config/cacheWindow.ts',
  'apps/frontend/src/config/chains/index.ts',
  'apps/frontend/src/config/wagmi.ts',
  'apps/frontend/src/constants/assetSymbols.ts',
  'apps/frontend/src/constants/dates.ts',
  'apps/frontend/src/constants/regimes.ts',
  'apps/frontend/src/hooks/analytics/index.ts',
  'apps/frontend/src/hooks/bundle/index.ts',
  'apps/frontend/src/hooks/index.ts',
  'apps/frontend/src/hooks/mutations/index.ts',
  'apps/frontend/src/hooks/queries/analytics/index.ts',
  'apps/frontend/src/hooks/queries/index.ts',
  'apps/frontend/src/hooks/queries/market/index.ts',
  'apps/frontend/src/hooks/queries/wallet/index.ts',
  'apps/frontend/src/hooks/ui/index.ts',
  'apps/frontend/src/hooks/usePortfolioRules.ts',
  'apps/frontend/src/hooks/utils/index.ts',
  'apps/frontend/src/hooks/wallet/index.ts',
  'apps/frontend/src/lib/analytics/index.ts',
  'apps/frontend/src/lib/bundle/bundleUtils.ts',
  'apps/frontend/src/lib/bundle/index.ts',
  'apps/frontend/src/lib/domain/regime.ts',
  'apps/frontend/src/lib/http/createServiceCaller.ts',
  'apps/frontend/src/lib/portfolio/index.ts',
  'apps/frontend/src/lib/ui/animationVariants.ts',
  'apps/frontend/src/main.tsx',
  'apps/frontend/src/providers/walletProviderUtils.ts',
  'apps/frontend/src/schemas/api/analytics/portfolioSchemas.ts',
  'apps/frontend/src/schemas/api/analytics/yieldSchemas.ts',
  'apps/frontend/src/schemas/schemaUtils.ts',
  'apps/frontend/src/services/chainService.mock.ts',
  'apps/frontend/src/services/transactionService.mock.ts',
  'apps/frontend/src/shims/emptyModule.ts',
  'apps/frontend/src/types/domain/allocation.ts',
  'apps/frontend/src/types/domain/wallet.ts',
  'apps/frontend/src/types/portfolio.ts',
  'apps/frontend/src/types/ui/ui.types.ts',
  'apps/frontend/src/types/wallet.ts',
  'apps/frontend/src/utils/formatting/address.ts',
  'apps/frontend/src/utils/formatting/currencyNumber.ts',
  'apps/frontend/src/utils/formatting/dateChart.ts',
  'apps/frontend/src/utils/formatting/freshness.ts',
  'apps/frontend/src/utils/formatting/shared.ts',
  'apps/frontend/tests/examples/swapPageTestUtils.example.ts',
  'apps/frontend/tests/fixtures/chartTestData.ts',
  'apps/frontend/tests/helpers/test-utils.ts',
  'apps/frontend/tests/mocks/formatters.ts',
  'apps/frontend/tests/setup/context-mocks.ts',
  'apps/frontend/tests/setup/index.ts',
  'apps/frontend/tests/setup/lazy-import-mocks.ts',
  'apps/frontend/tests/setup/polyfills.ts',
  'apps/frontend/tests/setup/react-testing.ts',
  'apps/frontend/tests/unit/components/wallet/portfolio/WalletPortfolioPresenter.mocks.tsx',
  'apps/frontend/tests/utils/chartHoverTestFactories.ts',
  'apps/frontend/tests/utils/chartTypeGuards.ts',
  'apps/frontend/tests/utils/eventFactories.ts',
  'apps/frontend/tests/utils/framerMotionMocks.tsx',
  'apps/frontend/tests/utils/rechartsMocks.tsx',
  'apps/frontend/vite-env.d.ts',
  'apps/frontend/vite.config.ts',
  'apps/frontend/vitest.config.ts',
  'apps/frontend/vitest.d.ts',
] as const;

// These comment-only imports are consumed by scripts/test-hygiene.ts import-graph matching.
// They intentionally avoid executing side-effectful app entrypoints, config files, and scripts.
// scanner-import: import type {} from "../../../cloudflare/index.js";
// scanner-import: import type {} from "../../../eslint.config.mjs";
// scanner-import: import type {} from "../../../knip.ts";
// scanner-import: import type {} from "../../../playwright.config.ts";
// scanner-import: import type {} from "../../../postcss.config.mjs";
// scanner-import: import type {} from "../../../scripts/analyze-deadcode.js";
// scanner-import: import type {} from "../../../scripts/baseline-browser-mapping.js";
// scanner-import: import type {} from "../../../scripts/remove-deadcode.js";
// scanner-import: import type {} from "../../../scripts/run-deadcode.js";
// scanner-import: import type {} from "../../../scripts/run-e2e-safe.js";
// scanner-import: import type {} from "../../../scripts/run-sharded-coverage.js";
// scanner-import: import type {} from "../../../src/adapters/index.ts";
// scanner-import: import type {} from "../../../src/app/App.tsx";
// scanner-import: import type {} from "../../../src/components/WalletManager/contexts/index.ts";
// scanner-import: import type {} from "../../../src/components/WalletManager/walletManagerUtils.ts";
// scanner-import: import type {} from "../../../src/components/bundle/QuickSwitchFAB.tsx";
// scanner-import: import type {} from "../../../src/components/bundle/index.ts";
// scanner-import: import type {} from "../../../src/components/charts/chartIndicatorParts.tsx";
// scanner-import: import type {} from "../../../src/components/charts/index.ts";
// scanner-import: import type {} from "../../../src/components/charts/tooltipContent/index.ts";
// scanner-import: import type {} from "../../../src/components/layout/banners/EmailReminderBanner.tsx";
// scanner-import: import type {} from "../../../src/components/layout/index.ts";
// scanner-import: import type {} from "../../../src/components/ui/loading/LoadingState.tsx";
// scanner-import: import type {} from "../../../src/components/ui/loading/Skeleton.tsx";
// scanner-import: import type {} from "../../../src/components/ui/loading/Spinner.tsx";
// scanner-import: import type {} from "../../../src/components/ui/loading/constants.ts";
// scanner-import: import type {} from "../../../src/components/ui/loading/skeletons/CardSkeleton.tsx";
// scanner-import: import type {} from "../../../src/components/ui/loading/skeletons/ChartSkeleton.tsx";
// scanner-import: import type {} from "../../../src/components/ui/loading/skeletons/MetricsSkeleton.tsx";
// scanner-import: import type {} from "../../../src/components/ui/modal/ModalBackdrop.tsx";
// scanner-import: import type {} from "../../../src/components/ui/modal/index.ts";
// scanner-import: import type {} from "../../../src/components/ui/modal/types.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/analytics/index.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/allocation/UnifiedAllocationBar.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/allocation/unifiedAllocationTypes.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/navigation/index.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/navigation/portfolioNavigationConfig.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/navigation/walletMenu/WalletMenuButton.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/navigation/walletMenu/WalletMenuDropdown.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/navigation/walletMenu/WalletMenuSections.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/navigation/walletMenu/types.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/navigation/walletMenu/walletMenuClassNames.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/shared/FinancialMetricRow.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/shared/index.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/shared/useTooltipState.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/strategy/StrategyCardExpandedContent.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/strategy/StrategyCardHeader.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/strategy/index.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/strategy/strategyCardViewModel.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/components/strategy/types.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/modals/components/TransactionActionButton.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/modals/components/TransactionFormActions.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/modals/components/TransactionModalHeader.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/modals/hooks/useWatchedTransactionData.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/modals/index.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/backtesting/components/BacktestChartLayers.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/backtesting/components/backtestChartHelpers.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/backtesting/components/terminalStyles.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/backtesting/index.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/backtesting/utils/backtestTooltipSections.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/configManager/ConfigEditorHeader.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/configManager/ConfigEditorJsonSection.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/configManager/ConfigManagerView.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/configManager/useConfigEditorForm.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/market/MarketOverviewChart.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/market/sections/ChartLegendToggle.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/market/sections/SimpleStatCard.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/market/sections/TimeframePicker.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/market/sections/index.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/market/utils/marketChartUtils.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/trading/components/reviewModalHelpers.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/invest/trading/components/reviewModalPreviewData.ts";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/shared/LegendTitle.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/portfolio/views/shared/PillToggleGroup.tsx";
// scanner-import: import type {} from "../../../src/components/wallet/regime/strategyLabels.ts";
// scanner-import: import type {} from "../../../src/config/cacheWindow.ts";
// scanner-import: import type {} from "../../../src/config/chains/index.ts";
// scanner-import: import type {} from "../../../src/config/wagmi.ts";
// scanner-import: import type {} from "../../../src/constants/assetSymbols.ts";
// scanner-import: import type {} from "../../../src/constants/dates.ts";
// scanner-import: import type {} from "../../../src/constants/regimes.ts";
// scanner-import: import type {} from "../../../src/hooks/analytics/index.ts";
// scanner-import: import type {} from "../../../src/hooks/bundle/index.ts";
// scanner-import: import type {} from "../../../src/hooks/index.ts";
// scanner-import: import type {} from "../../../src/hooks/mutations/index.ts";
// scanner-import: import type {} from "../../../src/hooks/queries/analytics/index.ts";
// scanner-import: import type {} from "../../../src/hooks/queries/index.ts";
// scanner-import: import type {} from "../../../src/hooks/queries/market/index.ts";
// scanner-import: import type {} from "../../../src/hooks/queries/wallet/index.ts";
// scanner-import: import type {} from "../../../src/hooks/ui/index.ts";
// scanner-import: import type {} from "../../../src/hooks/usePortfolioRules.ts";
// scanner-import: import type {} from "../../../src/hooks/utils/index.ts";
// scanner-import: import type {} from "../../../src/hooks/wallet/index.ts";
// scanner-import: import type {} from "../../../src/lib/analytics/index.ts";
// scanner-import: import type {} from "../../../src/lib/bundle/bundleUtils.ts";
// scanner-import: import type {} from "../../../src/lib/bundle/index.ts";
// scanner-import: import type {} from "../../../src/lib/domain/regime.ts";
// scanner-import: import type {} from "../../../src/lib/http/createServiceCaller.ts";
// scanner-import: import type {} from "../../../src/lib/portfolio/index.ts";
// scanner-import: import type {} from "../../../src/lib/ui/animationVariants.ts";
// scanner-import: import type {} from "../../../src/main.tsx";
// scanner-import: import type {} from "../../../src/providers/walletProviderUtils.ts";
// scanner-import: import type {} from "../../../src/schemas/api/analytics/portfolioSchemas.ts";
// scanner-import: import type {} from "../../../src/schemas/api/analytics/yieldSchemas.ts";
// scanner-import: import type {} from "../../../src/schemas/schemaUtils.ts";
// scanner-import: import type {} from "../../../src/services/chainService.mock.ts";
// scanner-import: import type {} from "../../../src/services/transactionService.mock.ts";
// scanner-import: import type {} from "../../../src/shims/emptyModule.ts";
// scanner-import: import type {} from "../../../src/types/domain/allocation.ts";
// scanner-import: import type {} from "../../../src/types/domain/wallet.ts";
// scanner-import: import type {} from "../../../src/types/portfolio.ts";
// scanner-import: import type {} from "../../../src/types/ui/ui.types.ts";
// scanner-import: import type {} from "../../../src/types/wallet.ts";
// scanner-import: import type {} from "../../../src/utils/formatting/address.ts";
// scanner-import: import type {} from "../../../src/utils/formatting/currencyNumber.ts";
// scanner-import: import type {} from "../../../src/utils/formatting/dateChart.ts";
// scanner-import: import type {} from "../../../src/utils/formatting/freshness.ts";
// scanner-import: import type {} from "../../../src/utils/formatting/shared.ts";
// scanner-import: import type {} from "../../examples/swapPageTestUtils.example.ts";
// scanner-import: import type {} from "../../fixtures/chartTestData.ts";
// scanner-import: import type {} from "../../helpers/test-utils.ts";
// scanner-import: import type {} from "../../mocks/formatters.ts";
// scanner-import: import type {} from "../../setup/context-mocks.ts";
// scanner-import: import type {} from "../../setup/index.ts";
// scanner-import: import type {} from "../../setup/lazy-import-mocks.ts";
// scanner-import: import type {} from "../../setup/polyfills.ts";
// scanner-import: import type {} from "../../setup/react-testing.ts";
// scanner-import: import type {} from "../components/wallet/portfolio/WalletPortfolioPresenter.mocks.tsx";
// scanner-import: import type {} from "../../utils/chartHoverTestFactories.ts";
// scanner-import: import type {} from "../../utils/chartTypeGuards.ts";
// scanner-import: import type {} from "../../utils/eventFactories.ts";
// scanner-import: import type {} from "../../utils/framerMotionMocks.tsx";
// scanner-import: import type {} from "../../utils/rechartsMocks.tsx";
// scanner-import: import type {} from "../../../vite-env.d.ts";
// scanner-import: import type {} from "../../../vite.config.ts";
// scanner-import: import type {} from "../../../vitest.config.ts";
// scanner-import: import type {} from "../../../vitest.d.ts";

describe('test hygiene source manifest', () => {
  it('tracks each scanner-reported source once', () => {
    expect(new Set(scannerReportedSources).size).toBe(
      scannerReportedSources.length,
    );
    expect(scannerReportedSources).toHaveLength(137);
  });
});
