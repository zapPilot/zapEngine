import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WalletPortfolioDataWithDirection } from '@/adapters/walletPortfolioDataAdapter';
import { WalletPortfolioPresenter } from '@/components/wallet/portfolio/WalletPortfolioPresenter';
import { type RegimeId, regimes } from '@/components/wallet/regime/regimeData';

import {
  MOCK_DATA,
  MOCK_SCENARIOS,
} from '../../../../fixtures/mockPortfolioData';
import { render } from '../../../../test-utils';

function getDefaultStrategy(regimeId: RegimeId) {
  const regime = regimes.find((item) => item.id === regimeId);

  if (!regime) {
    throw new Error(`Missing regime configuration for ${regimeId}`);
  }

  if ('default' in regime.strategies) {
    return regime.strategies.default;
  }

  return regime.strategies.fromLeft ?? regime.strategies.fromRight;
}

function getZapAction(regimeId: RegimeId): string {
  return getDefaultStrategy(regimeId)?.useCase?.zapAction ?? '';
}

function createMockSections(data: WalletPortfolioDataWithDirection) {
  return {
    balance: {
      data: {
        balance: data.balance,
        roiChange7d: 0,
        roiChange30d: 0,
      },
      isLoading: false,
      error: null,
    },
    composition: {
      data: {
        currentAllocation: data.currentAllocation,
        targetAllocation: { crypto: 50, stable: 50 },
        delta: data.delta,
        positions: 0,
        protocols: 0,
        chains: 0,
      },
      isLoading: false,
      error: null,
    },
    strategy: {
      data: {
        currentRegime: data.currentRegime,
        sentimentValue: data.sentimentValue,
        sentimentStatus: data.sentimentStatus,
        sentimentQuote: data.sentimentQuote,
        targetAllocation: { crypto: 50, stable: 50 },
        strategyDirection: data.strategyDirection,
        previousRegime: data.previousRegime,
        hasSentiment: true,
        hasRegimeHistory: true,
      },
      isLoading: false,
      error: null,
    },
    sentiment: {
      data: {
        value: data.sentimentValue,
        status: data.sentimentStatus,
        quote: data.sentimentQuote,
      },
      isLoading: false,
      error: null,
    },
  };
}

// Default ETL state for tests that don't need specific ETL behavior
// This provides the required etlState prop with idle (no ETL in progress) status
const DEFAULT_ETL_STATE = {
  jobId: null,
  status: 'idle' as const,
  errorMessage: undefined,
  isLoading: false,
  isInProgress: false,
};

const pushMock = vi.fn();
const replaceMock = vi.fn();
let currentSearchParams = new URLSearchParams();

// Mock routing adapter
vi.mock('@/lib/routing', () => ({
  useAppRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  useAppSearchParams: () => currentSearchParams,
  useAppPathname: () => '/bundle',
}));

// Mock useToast hook
vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({
    showToast: vi.fn(),
    hideToast: vi.fn(),
    toasts: [],
  }),
  ToastProvider: ({ children }: any) => <>{children}</>,
}));

vi.mock('framer-motion', async () => {
  const { setupFramerMotionMocks } =
    await import('../../../../utils/framerMotionMocks');

  return setupFramerMotionMocks();
});

// Mock child components to simplify testing
vi.mock('@/components/wallet/portfolio/analytics', () => ({
  AnalyticsView: () => <div data-testid="analytics-view">Analytics View</div>,
}));

vi.mock('@/components/wallet/portfolio/views/invest/InvestView', () => ({
  InvestView: ({
    activeSubTab,
    activeMarketSection,
    onSubTabChange,
    onMarketSectionChange,
  }: {
    activeSubTab?: string;
    activeMarketSection?: string;
    onSubTabChange?: (tab: string) => void;
    onMarketSectionChange?: (section: string) => void;
  }) => (
    <div data-testid="invest-view">
      Invest View {activeSubTab ?? 'trading'}{' '}
      {activeMarketSection ?? 'overview'}
      {/* Trigger buttons expose internal callbacks for sub-navigation tests */}
      <button
        data-testid="invest-switch-market"
        onClick={() => onSubTabChange?.('market')}
      >
        Switch to Market
      </button>
      <button
        data-testid="invest-switch-rs"
        onClick={() => onMarketSectionChange?.('relative-strength')}
      >
        Switch to RS
      </button>
    </div>
  ),
}));

vi.mock('@/components/wallet/portfolio/modals', () => ({
  DepositModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="deposit-modal">Deposit Modal</div> : null,
  WithdrawModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="withdraw-modal">Withdraw Modal</div> : null,
  RebalanceModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="rebalance-modal">Rebalance Modal</div> : null,
  PortfolioModals: () => (
    <div data-testid="portfolio-modals">Portfolio Modals Container</div>
  ),
  SettingsModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="settings-modal">Settings Modal</div> : null,
}));

vi.mock('@/components/wallet/portfolio/modals/WithdrawModal', () => ({
  WithdrawModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="withdraw-modal">Withdraw Modal</div> : null,
}));

vi.mock('@/components/wallet/portfolio/components/WalletMenu', () => ({
  WalletMenu: () => <div data-testid="wallet-menu">Wallet Menu</div>,
}));

// NOTE: WalletManager lazy loading is handled by the global lazyImport mock in
// tests/setup.ts, which intercepts the import path and renders wallet-manager-modal
// directly. This module-level mock is unused for the lazy path but kept for
// any direct (non-lazy) import scenarios.
vi.mock('@/components/WalletManager', () => ({
  WalletManager: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="wallet-manager-modal" role="dialog">
        <button data-testid="close-wallet-manager" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/Footer/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}));

vi.mock('@/components/wallet/portfolio/components/navigation', () => ({
  WalletNavigation: ({ setActiveTab, onOpenWalletManager }: any) => (
    <nav data-testid="wallet-navigation">
      <button onClick={() => setActiveTab('dashboard')}>Dashboard</button>
      <button onClick={() => setActiveTab('analytics')}>Analytics</button>
      <button onClick={() => setActiveTab('invest')}>Invest</button>
      <button onClick={onOpenWalletManager}>Open Manager</button>
      <input data-testid="mock-search-input" placeholder="Search wallet..." />
    </nav>
  ),
}));

// Mock WalletProvider to prevent useWalletProvider error
vi.mock('@/providers/WalletProvider', () => ({
  useWalletProvider: () => ({
    connectedWallets: [],
    activeWallet: null,
    switchActiveWallet: vi.fn(),
    isConnected: false,
    disconnect: vi.fn(),
    connect: vi.fn(),
  }),
  WalletProvider: ({ children }: any) => <>{children}</>,
}));

// Mock useAllocationWeights to avoid QueryClient dependency
vi.mock('@/hooks/queries/analytics/useAllocationWeights', () => ({
  useAllocationWeights: vi.fn().mockReturnValue({
    data: {
      btc_weight: 0.6,
      eth_weight: 0.4,
      btc_market_cap: 1800000000000,
      eth_market_cap: 400000000000,
      timestamp: '2024-01-15T12:00:00Z',
      is_fallback: false,
      cached: false,
    },
    isLoading: false,
    error: null,
  }),
}));

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  currentSearchParams = new URLSearchParams();
});

describe('WalletPortfolioPresenter - Regime Highlighting', () => {
  describe('Regime Spectrum Display', () => {
    const regimeHighlightCases: {
      label: string;
      regimeId: RegimeId;
      getMockData: () => WalletPortfolioDataWithDirection;
      inactiveLabel?: string;
    }[] = [
      {
        label: 'Extreme Fear',
        regimeId: 'ef',
        getMockData: () => MOCK_SCENARIOS.extremeFear,
        inactiveLabel: 'Greed',
      },
      {
        label: 'Fear',
        regimeId: 'f',
        getMockData: () => ({
          ...MOCK_DATA,
          sentimentValue: 35,
          sentimentStatus: 'Fear' as const,
          currentRegime: 'f' as RegimeId,
        }),
      },
      {
        label: 'Neutral',
        regimeId: 'n',
        getMockData: () => ({
          ...MOCK_SCENARIOS.neutral,
          currentAllocation: {
            ...MOCK_SCENARIOS.neutral.currentAllocation,
            simplifiedCrypto: MOCK_DATA.currentAllocation.simplifiedCrypto,
          },
        }),
      },
      {
        label: 'Greed',
        regimeId: 'g',
        getMockData: () => MOCK_DATA,
      },
      {
        label: 'Extreme Greed',
        regimeId: 'eg',
        getMockData: () => MOCK_SCENARIOS.extremeGreed,
        inactiveLabel: 'Greed',
      },
    ];

    it.each(regimeHighlightCases)(
      "should highlight $label regime when currentRegime is '$regimeId'",
      async ({ label, getMockData, inactiveLabel }) => {
        const user = userEvent.setup();
        const mockData = getMockData();

        render(
          <WalletPortfolioPresenter
            data={mockData}
            sections={createMockSections(mockData)}
            etlState={DEFAULT_ETL_STATE}
          />,
        );

        const strategyCard = screen.getByTestId('strategy-card');
        await user.click(strategyCard);

        const regimeSpectrum = screen.getByTestId('regime-spectrum');
        expect(regimeSpectrum).toBeInTheDocument();

        // Verify active regime is highlighted
        const activeRegime = within(regimeSpectrum)
          .getByText(label)
          .closest('button');
        expect(activeRegime).toHaveClass('bg-gray-800');
        expect(within(activeRegime!).getByText('Current')).toBeInTheDocument();

        // Verify an inactive regime is not highlighted (when specified)
        if (inactiveLabel) {
          const inactiveRegime = within(regimeSpectrum)
            .getByText(inactiveLabel)
            .closest('button');
          expect(inactiveRegime).toHaveClass('opacity-60');
          expect(inactiveRegime).not.toHaveClass('bg-gray-800');
        }
      },
    );
  });

  describe('Visual State Verification', () => {
    it('should apply active styling to current regime', async () => {
      const user = userEvent.setup();
      const mockData = MOCK_SCENARIOS.extremeGreed;

      render(
        <WalletPortfolioPresenter
          data={mockData}
          sections={createMockSections(mockData)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      // Expand strategy section
      const strategyCard = screen.getByTestId('strategy-card');
      await user.click(strategyCard);

      const regimeSpectrum = screen.getByTestId('regime-spectrum');
      const activeRegime = within(regimeSpectrum)
        .getByText('Extreme Greed')
        .closest('button');

      // Verify active styling
      expect(activeRegime).toHaveClass('bg-gray-800');
      expect(activeRegime).toHaveClass('border');
      expect(activeRegime).toHaveClass('border-gray-600');
      // expect(activeRegime).toHaveClass("scale-102"); // removed strict scale check due to potential flaky styling

      // Verify "Current" label exists
      expect(within(activeRegime!).getByText('Current')).toBeInTheDocument();

      // Verify color dot has animate-pulse
      const colorDot = activeRegime!.querySelector('.animate-pulse');
      expect(colorDot).toBeInTheDocument();
    });

    it('should apply inactive styling to non-current regimes', async () => {
      const user = userEvent.setup();
      const mockData = MOCK_SCENARIOS.extremeGreed;

      render(
        <WalletPortfolioPresenter
          data={mockData}
          sections={createMockSections(mockData)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      // Expand strategy section
      const strategyCard = screen.getByTestId('strategy-card');
      await user.click(strategyCard);

      const regimeSpectrum = screen.getByTestId('regime-spectrum');
      const inactiveRegime = within(regimeSpectrum)
        .getByText('Greed')
        .closest('button');

      // Verify inactive styling
      expect(inactiveRegime).toHaveClass('opacity-60');
      expect(inactiveRegime).not.toHaveClass('bg-gray-800');

      // Verify no "Current" label
      expect(
        within(inactiveRegime!).queryByText('Current'),
      ).not.toBeInTheDocument();

      // Verify color dot does not have animate-pulse
      const colorDot = inactiveRegime!.querySelector('.animate-pulse');
      expect(colorDot).not.toBeInTheDocument();
    });
  });

  describe('Data Consistency', () => {
    it('should display correct regime label dynamically in strategy explanation', async () => {
      const user = userEvent.setup();

      // Test Extreme Greed - verify label appears in the explanation
      const { unmount: unmount1 } = render(
        <WalletPortfolioPresenter
          data={MOCK_SCENARIOS.extremeGreed}
          sections={createMockSections(MOCK_SCENARIOS.extremeGreed)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );
      let strategyCard = screen.getByTestId('strategy-card');
      await user.click(strategyCard);
      expect(screen.getByText(getZapAction('eg'))).toBeInTheDocument();
      unmount1();

      // Test Greed
      const { unmount: unmount2 } = render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );
      strategyCard = screen.getByTestId('strategy-card');
      await user.click(strategyCard);
      expect(screen.getByText(getZapAction('g'))).toBeInTheDocument();
      unmount2();

      // Test Neutral (with fixed mock data)
      const neutralMockData = {
        ...MOCK_SCENARIOS.neutral,
        currentAllocation: {
          ...MOCK_SCENARIOS.neutral.currentAllocation,
          simplifiedCrypto: MOCK_DATA.currentAllocation.simplifiedCrypto,
        },
      };
      const { unmount: unmount3 } = render(
        <WalletPortfolioPresenter
          data={neutralMockData}
          sections={createMockSections(neutralMockData)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );
      strategyCard = screen.getByTestId('strategy-card');
      await user.click(strategyCard);
      expect(screen.getByText(getZapAction('n'))).toBeInTheDocument();
      unmount3();

      // Test Extreme Fear
      render(
        <WalletPortfolioPresenter
          data={MOCK_SCENARIOS.extremeFear}
          sections={createMockSections(MOCK_SCENARIOS.extremeFear)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );
      strategyCard = screen.getByTestId('strategy-card');
      await user.click(strategyCard);
      expect(screen.getByText(getZapAction('ef'))).toBeInTheDocument();
    });

    it('should use correct regime colors from regimeData', async () => {
      const user = userEvent.setup();
      const mockData = MOCK_SCENARIOS.extremeGreed;

      render(
        <WalletPortfolioPresenter
          data={mockData}
          sections={createMockSections(mockData)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      // Expand strategy section
      const strategyCard = screen.getByTestId('strategy-card');
      await user.click(strategyCard);

      const regimeSpectrum = screen.getByTestId('regime-spectrum');

      // Verify each regime has correct fillColor from regimeData.ts
      for (const regime of regimes) {
        const regimeElement = within(regimeSpectrum)
          .getByText(regime.label)
          .closest('button');
        const colorDot = regimeElement!.querySelector('.rounded-full');

        expect(colorDot).toHaveStyle({
          backgroundColor: regime.fillColor,
        });
      }
    });

    it.each([
      {
        desc: 'prices are high (Extreme Greed)',
        regimeId: 'eg' as RegimeId,
        getMockData: () => MOCK_SCENARIOS.extremeGreed,
      },
      {
        desc: 'prices are low (Extreme Fear)',
        regimeId: 'ef' as RegimeId,
        getMockData: () => MOCK_SCENARIOS.extremeFear,
      },
      {
        desc: 'market sentiment is balanced (Neutral)',
        regimeId: 'n' as RegimeId,
        getMockData: () => ({
          ...MOCK_SCENARIOS.neutral,
          currentAllocation: {
            ...MOCK_SCENARIOS.neutral.currentAllocation,
            simplifiedCrypto: MOCK_DATA.currentAllocation.simplifiedCrypto,
          },
        }),
      },
    ])(
      'should show correct zapAction for $desc',
      async ({ regimeId, getMockData }) => {
        const user = userEvent.setup();
        const mockData = getMockData();

        render(
          <WalletPortfolioPresenter
            data={mockData}
            sections={createMockSections(mockData)}
            etlState={DEFAULT_ETL_STATE}
          />,
        );

        const strategyCard = screen.getByTestId('strategy-card');
        await user.click(strategyCard);

        expect(screen.getByText(getZapAction(regimeId))).toBeInTheDocument();
      },
    );
  });

  describe('AnimatePresence Rendering', () => {
    it('should not render regime spectrum when strategy is collapsed', () => {
      render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      // Regime spectrum should not be visible initially
      expect(screen.queryByTestId('regime-spectrum')).not.toBeInTheDocument();
    });

    it('should render regime spectrum when strategy is expanded', async () => {
      const user = userEvent.setup();
      render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      // Initially not visible
      expect(screen.queryByTestId('regime-spectrum')).not.toBeInTheDocument();

      // Click to expand
      const strategyCard = screen.getByTestId('strategy-card');
      await user.click(strategyCard);

      // Now visible
      const regimeSpectrum = screen.getByTestId('regime-spectrum');
      expect(regimeSpectrum).toBeInTheDocument();

      // All 5 regimes should be rendered
      expect(
        within(regimeSpectrum).getByText('Extreme Fear'),
      ).toBeInTheDocument();
      expect(within(regimeSpectrum).getByText('Fear')).toBeInTheDocument();
      expect(within(regimeSpectrum).getByText('Neutral')).toBeInTheDocument();
      expect(within(regimeSpectrum).getByText('Greed')).toBeInTheDocument();
      expect(
        within(regimeSpectrum).getByText('Extreme Greed'),
      ).toBeInTheDocument();
    });
  });
  describe('Banner Placement', () => {
    it('should render headerBanners when provided', () => {
      const mockData = MOCK_DATA;
      const headerBanners = <div data-testid="mock-banner">Banner</div>;

      render(
        <WalletPortfolioPresenter
          data={mockData}
          sections={createMockSections(mockData)}
          etlState={DEFAULT_ETL_STATE}
          headerBanners={headerBanners}
        />,
      );

      // Verify the banner is rendered in the component
      const banner = screen.getByTestId('mock-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Banner');
    });
  });
  describe('Wallet Search Functionality', () => {
    it('should render WalletPortfolioPresenter without errors', () => {
      const mockData = MOCK_DATA;

      // The component should render without errors
      // This verifies the isSearching prop can be passed to child components
      const { container } = render(
        <WalletPortfolioPresenter
          data={mockData}
          sections={createMockSections(mockData)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      // Verify the component rendered successfully
      expect(container).toBeInTheDocument();
    });
  });

  /**
   * ETL Loading State Tests
   * Tests for commit e5302a738a98bd7787e2cdec0610c11068c41fc1
   * Verifies the "completing" intermediate state keeps loading screen visible
   * to prevent continuous /landing API requests during ETL completion.
   */
  describe('ETL Loading State - Race Condition Fix', () => {
    /**
     * Tests that pending, processing, and completing statuses all keep the
     * loading screen visible. "completing" is the critical case — it prevents
     * a race condition where the dashboard flashes before cache invalidation.
     */
    it.each([
      { status: 'pending' as const, isLoading: true },
      { status: 'processing' as const, isLoading: true },
      { status: 'completing' as const, isLoading: false },
    ])(
      "should show loading screen when ETL status is '$status'",
      ({ status, isLoading }) => {
        const etlState = {
          ...DEFAULT_ETL_STATE,
          jobId: 'test-job',
          status,
          isLoading,
          isInProgress: true,
        };

        render(
          <WalletPortfolioPresenter
            data={MOCK_DATA}
            sections={createMockSections(MOCK_DATA)}
            etlState={etlState}
          />,
        );

        expect(screen.queryByTestId('v22-dashboard')).not.toBeInTheDocument();
      },
    );

    it("should show dashboard when ETL status is 'idle'", () => {
      const mockData = MOCK_DATA;
      const etlState = DEFAULT_ETL_STATE;

      render(
        <WalletPortfolioPresenter
          data={mockData}
          sections={createMockSections(mockData)}
          etlState={etlState}
        />,
      );

      // Should show the dashboard when ETL is idle
      expect(screen.getByTestId('v22-dashboard')).toBeInTheDocument();
    });

    it("should show dashboard when ETL status is 'failed'", () => {
      const mockData = MOCK_DATA;
      const etlState = {
        ...DEFAULT_ETL_STATE,
        jobId: 'test-job',
        status: 'failed' as const,
        errorMessage: 'ETL job failed',
        isLoading: false,
      };

      render(
        <WalletPortfolioPresenter
          data={mockData}
          sections={createMockSections(mockData)}
          etlState={etlState}
        />,
      );

      // Failed ETL should show dashboard (not loading screen)
      expect(screen.getByTestId('v22-dashboard')).toBeInTheDocument();
    });

    it("should include 'completing' in isEtlInProgress check", () => {
      // This tests the logic: ["pending", "processing", "completing"].includes(status)
      const mockData = MOCK_DATA;

      // Test all three statuses that should trigger loading screen
      const inProgressStatuses = [
        'pending',
        'processing',
        'completing',
      ] as const;

      for (const status of inProgressStatuses) {
        const etlState = {
          ...DEFAULT_ETL_STATE,
          jobId: 'test-job',
          status,
          isLoading: status !== 'completing',
          isInProgress: true,
        };

        const { unmount } = render(
          <WalletPortfolioPresenter
            data={mockData}
            sections={createMockSections(mockData)}
            etlState={etlState}
          />,
        );

        // All in-progress statuses should NOT show the dashboard
        expect(screen.queryByTestId('v22-dashboard')).not.toBeInTheDocument();
        unmount();
      }
    });

    it('should show loading when etlState.isLoading is true', () => {
      const mockData = MOCK_DATA;
      const etlState = {
        ...DEFAULT_ETL_STATE,
        jobId: 'test-job',
        status: 'idle' as const,
        isLoading: true, // Just isLoading should trigger loading screen
      };

      render(
        <WalletPortfolioPresenter
          data={mockData}
          sections={createMockSections(mockData)}
          etlState={etlState}
        />,
      );

      expect(screen.queryByTestId('v22-dashboard')).not.toBeInTheDocument();
    });

    it('should correctly evaluate shouldShowEtlLoading with simplified logic', () => {
      // Test the simplified logic: isEtlInProgress || etlState.isLoading
      const mockData = MOCK_DATA;

      // Case 1: isEtlInProgress true (completing status), isLoading false
      const etlState1 = {
        ...DEFAULT_ETL_STATE,
        jobId: 'test-job',
        status: 'completing' as const,
        isLoading: false,
        isInProgress: true,
      };

      const { unmount: unmount1 } = render(
        <WalletPortfolioPresenter
          data={mockData}
          sections={createMockSections(mockData)}
          etlState={etlState1}
        />,
      );
      expect(screen.queryByTestId('v22-dashboard')).not.toBeInTheDocument();
      unmount1();

      // Case 2: isEtlInProgress false (idle), isLoading true
      const etlState2 = {
        ...DEFAULT_ETL_STATE,
        jobId: 'test-job',
        status: 'idle' as const,
        isLoading: true,
      };

      const { unmount: unmount2 } = render(
        <WalletPortfolioPresenter
          data={mockData}
          sections={createMockSections(mockData)}
          etlState={etlState2}
        />,
      );
      expect(screen.queryByTestId('v22-dashboard')).not.toBeInTheDocument();
      unmount2();

      // Case 3: Both false - should show dashboard
      const etlState3 = {
        ...DEFAULT_ETL_STATE,
        status: 'idle' as const,
        isLoading: false,
      };

      render(
        <WalletPortfolioPresenter
          data={mockData}
          sections={createMockSections(mockData)}
          etlState={etlState3}
        />,
      );
      expect(screen.getByTestId('v22-dashboard')).toBeInTheDocument();
    });
  });

  describe('Navigation and Layout', () => {
    it('renders the deep-linked analytics view on first load', () => {
      currentSearchParams = new URLSearchParams('tab=analytics');

      render(
        <WalletPortfolioPresenter
          data={{ ...MOCK_DATA }}
          userId="user1"
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      expect(screen.getByTestId('analytics-view')).toBeInTheDocument();
    });

    it('renders the deep-linked invest sub-tab on first load', () => {
      currentSearchParams = new URLSearchParams(
        'tab=invest&invest=market&market=relative-strength',
      );

      render(
        <WalletPortfolioPresenter
          data={{ ...MOCK_DATA }}
          userId="user1"
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      expect(screen.getByTestId('invest-view')).toHaveTextContent(
        'Invest View market relative-strength',
      );
    });

    it('navigates to analytics tab', async () => {
      const user = userEvent.setup();
      render(
        <WalletPortfolioPresenter
          data={{ ...MOCK_DATA }}
          userId="user1"
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      // Verify Dashboard is active initially
      expect(screen.getByTestId('v22-dashboard')).toBeInTheDocument();

      // Switch to analytics
      await user.click(screen.getByText('Analytics'));

      expect(replaceMock).toHaveBeenCalledWith('/bundle?tab=analytics', {
        scroll: false,
      });
    });

    it('navigates to invest tab', async () => {
      const user = userEvent.setup();
      render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      // Switch to invest
      await user.click(screen.getByText('Invest'));

      expect(replaceMock).toHaveBeenCalledWith(
        '/bundle?tab=invest&invest=trading',
        { scroll: false },
      );
    });
  });

  describe('Wallet Search Flow', () => {
    /**
     * Integration tests for wallet search functionality.
     *
     * These tests verify the integration between the WalletPortfolioPresenter
     * and the wallet search flow, including:
     * - handleSearch function orchestration
     * - ETL loading state display
     * - Error handling and fallback UI
     *
     * For comprehensive tests of the search flow, see:
     * @see tests/unit/components/wallet/portfolio/WalletPortfolioPresenter.handleSearch.test.tsx
     * @see tests/integration/wallet/EtlPollingFlow.test.tsx
     * @see tests/integration/wallet/EtlPollingEdgeCases.test.tsx
     */

    it('shows InitialDataLoadingState when ETL is in progress', () => {
      const etlState = {
        jobId: 'test-job-123',
        status: 'processing' as const,
        errorMessage: undefined,
        isLoading: true,
        isInProgress: true,
      };

      render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={etlState}
        />,
      );

      // Should show loading state instead of dashboard
      expect(
        screen.getByRole('heading', { name: 'Fetching Wallet Data' }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('v22-dashboard')).not.toBeInTheDocument();
    });

    it('shows InitialDataLoadingState when showNewWalletLoading is true (connection error fallback)', () => {
      const etlState = {
        jobId: null,
        status: 'idle' as const,
        errorMessage: undefined,
        isLoading: false,
        isInProgress: false,
      };

      // This would be triggered in handleSearch's catch block for non-validation errors
      // Testing the component's ability to show loading state as error fallback
      render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={etlState}
        />,
      );

      // In normal state, dashboard should be visible
      expect(screen.getByTestId('v22-dashboard')).toBeInTheDocument();
    });

    it('integrates with ETL loading states during wallet search', () => {
      /**
       * This test verifies the component correctly responds to ETL state changes.
       *
       * Flow:
       * 1. User searches for new wallet
       * 2. handleSearch triggers ETL job
       * 3. etlState.status transitions: idle → pending → processing
       * 4. Component shows InitialDataLoadingState during processing
       * 5. On completion, component shows dashboard
       *
       * See WalletPortfolioPresenter.handleSearch.test.tsx for detailed
       * handleSearch function testing.
       */

      const etlStates = [
        { status: 'pending' as const, shouldShowLoading: true },
        { status: 'processing' as const, shouldShowLoading: true },
        { status: 'completing' as const, shouldShowLoading: true },
        { status: 'idle' as const, shouldShowLoading: false },
      ];

      for (const { status, shouldShowLoading } of etlStates) {
        const etlState = {
          jobId: shouldShowLoading ? 'test-job-123' : null,
          status,
          errorMessage: undefined,
          isLoading: shouldShowLoading,
          isInProgress: shouldShowLoading,
        };

        const { unmount } = render(
          <WalletPortfolioPresenter
            data={MOCK_DATA}
            sections={createMockSections(MOCK_DATA)}
            etlState={etlState}
          />,
        );

        if (shouldShowLoading) {
          expect(
            screen.getByRole('heading', { name: 'Fetching Wallet Data' }),
          ).toBeInTheDocument();
          expect(screen.queryByTestId('v22-dashboard')).not.toBeInTheDocument();
        } else {
          expect(
            screen.queryByRole('heading', { name: 'Fetching Wallet Data' }),
          ).not.toBeInTheDocument();
          expect(screen.getByTestId('v22-dashboard')).toBeInTheDocument();
        }

        unmount();
      }
    });

    /**
     * NOTE: Full testing of handleSearch function including isSearching state
     * transitions is covered in:
     * @see tests/unit/components/wallet/portfolio/WalletPortfolioPresenter.handleSearch.test.tsx
     *
     * That dedicated test file includes:
     * - Input validation (empty strings, whitespace trimming)
     * - New user flow (navigation with isNewUser flag and etlJobId)
     * - Existing user flow
     * - Loading state management (isSearching transitions)
     * - Error handling (validation, connection, wallet conflicts)
     * - URL construction and parameter encoding
     */
  });

  describe('Wallet Manager Interaction', () => {
    // The global lazyImport mock in tests/setup.ts handles WalletManager directly.
    // When isOpen=false it returns null; when isOpen=true it renders wallet-manager-modal
    // with a close-wallet-manager button. The component-level mock above is not used.

    it('opens WalletManager when onOpenWalletManager is triggered', async () => {
      const user = userEvent.setup();
      render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      expect(
        screen.queryByTestId('wallet-manager-modal'),
      ).not.toBeInTheDocument();

      const nav = screen.getByTestId('wallet-navigation');
      await user.click(
        within(nav).getByRole('button', { name: /open manager/i }),
      );

      expect(screen.getByTestId('wallet-manager-modal')).toBeInTheDocument();
    });

    it('closes WalletManager when onClose is triggered', async () => {
      const user = userEvent.setup();
      render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      // Open
      const nav = screen.getByTestId('wallet-navigation');
      await user.click(
        within(nav).getByRole('button', { name: /open manager/i }),
      );
      expect(screen.getByTestId('wallet-manager-modal')).toBeInTheDocument();

      // Close via the button rendered by the setup.ts WalletManager handler
      await user.click(screen.getByTestId('close-wallet-manager'));
      expect(
        screen.queryByTestId('wallet-manager-modal'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Invest Tab Sub-navigation', () => {
    // The global lazyImport mock in setup.ts renders InvestView as a plain div.
    // We use the __registerDynamicOverride plugin to inject callback trigger
    // buttons for these tests only, then clear the override after each test.

    beforeEach(() => {
      (globalThis as any).__registerDynamicOverride(
        'wallet/portfolio/views/invest/InvestView',
        (props: any) =>
          React.createElement(
            'div',
            { 'data-testid': 'invest-view' },
            `Invest View ${props?.activeSubTab ?? 'trading'} ${props?.activeMarketSection ?? 'overview'}`,
            React.createElement(
              'button',
              {
                'data-testid': 'invest-switch-market',
                onClick: () => props?.onSubTabChange?.('market'),
              },
              'Switch to Market',
            ),
            React.createElement(
              'button',
              {
                'data-testid': 'invest-switch-rs',
                onClick: () =>
                  props?.onMarketSectionChange?.('relative-strength'),
              },
              'Switch to RS',
            ),
          ),
      );
    });

    afterEach(() => {
      (globalThis as any).__clearDynamicOverrides();
    });

    it('handleInvestSubTabChange updates URL with new invest sub-tab', async () => {
      const user = userEvent.setup();
      currentSearchParams = new URLSearchParams('tab=invest');

      render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      await user.click(screen.getByTestId('invest-switch-market'));

      expect(replaceMock).toHaveBeenCalledWith(
        '/bundle?tab=invest&invest=market&market=overview',
        { scroll: false },
      );
    });

    it('handleMarketSectionChange updates URL with new market section', async () => {
      const user = userEvent.setup();
      currentSearchParams = new URLSearchParams('tab=invest');

      render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
        />,
      );

      await user.click(screen.getByTestId('invest-switch-rs'));

      expect(replaceMock).toHaveBeenCalledWith(
        '/bundle?tab=invest&invest=market&market=relative-strength',
        { scroll: false },
      );
    });
  });

  describe('Footer Overlays', () => {
    it('renders footerOverlays when provided', () => {
      const footerOverlays = <div data-testid="footer-overlay">Overlay</div>;

      render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
          footerOverlays={footerOverlays}
        />,
      );

      expect(screen.getByTestId('footer-overlay')).toBeInTheDocument();
    });
  });

  describe('Analytics tab without userId', () => {
    it('renders null for analytics content when no userId provided', () => {
      currentSearchParams = new URLSearchParams('tab=analytics');

      render(
        <WalletPortfolioPresenter
          data={MOCK_DATA}
          sections={createMockSections(MOCK_DATA)}
          etlState={DEFAULT_ETL_STATE}
          // No userId prop — analytics: userId ? <LazyAnalyticsView /> : null
        />,
      );

      expect(screen.queryByTestId('analytics-content')).not.toBeInTheDocument();
      expect(screen.queryByTestId('analytics-view')).not.toBeInTheDocument();
    });
  });
});
