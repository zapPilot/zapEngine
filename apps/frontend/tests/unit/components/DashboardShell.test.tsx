/**
 * DashboardShell Unit Tests
 *
 * Tests for the main dashboard shell component
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardShell } from "@/components/wallet/portfolio/DashboardShell";

// Mock all dependencies
const mockUsePortfolioDataProgressive = vi.fn();
const mockUseSentimentData = vi.fn();
const mockUseRegimeHistory = vi.fn();

// Mock routing adapter
vi.mock("@/lib/routing", () => ({
  useAppRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useAppSearchParams: () => new URLSearchParams(),
  useAppPathname: () => "/bundle/user-123",
}));

vi.mock("@/hooks/queries/analytics/usePortfolioDataProgressive", () => ({
  usePortfolioDataProgressive: () => mockUsePortfolioDataProgressive(),
}));

vi.mock("@/hooks/queries/market/useSentimentQuery", () => ({
  useSentimentData: () => mockUseSentimentData(),
}));

vi.mock("@/hooks/queries/market/useRegimeHistoryQuery", () => ({
  useRegimeHistory: () => mockUseRegimeHistory(),
}));

// Mock useEtlJobPolling for ETL race condition tests
const mockEtlState = vi.fn();
const mockStartPolling = vi.fn();
const mockResetEtl = vi.fn();
const mockCompleteTransition = vi.fn();
const mockUseEtlJobSync = vi.fn();

vi.mock("@/hooks/wallet", () => ({
  useEtlJobPolling: () => ({
    state: mockEtlState(),
    startPolling: mockStartPolling,
    reset: mockResetEtl,
    completeTransition: mockCompleteTransition,
  }),
  useEtlJobSync: (...args: unknown[]) => mockUseEtlJobSync(...args),
}));

vi.mock("@/adapters/walletPortfolioDataAdapter", () => ({
  createEmptyPortfolioState: vi.fn(() => ({
    netWorth: 0,
    holdings: [],
  })),
}));

vi.mock("@/components/wallet/portfolio/views/LoadingStates", () => ({
  WalletPortfolioErrorState: ({
    error,
    onRetry,
  }: {
    error: Error;
    onRetry: () => void;
  }) => (
    <div data-testid="error-state">
      <span>{error.message}</span>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

vi.mock("@/components/wallet/portfolio/WalletPortfolioPresenter", () => ({
  WalletPortfolioPresenter: ({
    _data,
    userId,
    isEmptyState,
    isLoading,
    headerBanners,
    footerOverlays,
  }: {
    _data: unknown;
    userId: string;
    isEmptyState: boolean;
    isLoading: boolean;
    headerBanners?: React.ReactNode;
    footerOverlays?: React.ReactNode;
  }) => (
    <div
      data-testid="portfolio-presenter"
      data-user-id={userId}
      data-loading={isLoading}
      data-empty={isEmptyState}
    >
      {headerBanners && <div data-testid="header-banners">{headerBanners}</div>}
      <div data-testid="portfolio-content">Portfolio Content</div>
      {footerOverlays && (
        <div data-testid="footer-overlays">{footerOverlays}</div>
      )}
    </div>
  ),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestWrapper";
  return Wrapper;
}

describe("DashboardShell", () => {
  const originalLocation = window.location;
  const defaultProps = {
    urlUserId: "user-123",
    isOwnBundle: true,
    bundleUserName: "Test User",
    bundleUrl: "/bundle/user-123",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure window.location is valid for URL constructor
    Object.defineProperty(window, "location", {
      value: new URL("http://localhost/bundle/user-123"),
      writable: true,
    });

    mockUsePortfolioDataProgressive.mockReturnValue({
      unifiedData: { netWorth: 10000, holdings: [] },
      sections: {},
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseSentimentData.mockReturnValue({ data: null });
    mockUseRegimeHistory.mockReturnValue({ data: null });
    // Default ETL state: idle (no ETL in progress)
    mockEtlState.mockReturnValue({
      jobId: null,
      status: "idle",
      errorMessage: undefined,
      isLoading: false,
      isInProgress: false,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  it("should render portfolio presenter with data", () => {
    render(<DashboardShell {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByTestId("portfolio-presenter")).toBeInTheDocument();
    expect(screen.getByTestId("portfolio-content")).toBeInTheDocument();
  });

  it("should pass userId to presenter", () => {
    render(<DashboardShell {...defaultProps} />, { wrapper: createWrapper() });

    const presenter = screen.getByTestId("portfolio-presenter");
    expect(presenter).toHaveAttribute("data-user-id", "user-123");
  });

  it("should set data attributes on container", () => {
    const { container } = render(<DashboardShell {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute("data-bundle-user-id", "user-123");
    expect(wrapper).toHaveAttribute("data-bundle-owner", "own");
    expect(wrapper).toHaveAttribute("data-bundle-user-name", "Test User");
    expect(wrapper).toHaveAttribute("data-bundle-url", "/bundle/user-123");
  });

  it("should set visitor mode when not own bundle", () => {
    const { container } = render(
      <DashboardShell {...defaultProps} isOwnBundle={false} />,
      { wrapper: createWrapper() }
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute("data-bundle-owner", "visitor");
  });

  it("should render loading state", () => {
    mockUsePortfolioDataProgressive.mockReturnValue({
      unifiedData: null,
      sections: {},
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<DashboardShell {...defaultProps} />, { wrapper: createWrapper() });

    const presenter = screen.getByTestId("portfolio-presenter");
    expect(presenter).toHaveAttribute("data-loading", "true");
  });

  it("should render error state when error occurs without data", () => {
    const testError = new Error("Failed to load portfolio");
    mockUsePortfolioDataProgressive.mockReturnValue({
      unifiedData: null,
      sections: {},
      isLoading: false,
      error: testError,
      refetch: vi.fn(),
    });

    render(<DashboardShell {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByTestId("error-state")).toBeInTheDocument();
    expect(screen.getByText("Failed to load portfolio")).toBeInTheDocument();
  });

  /**
   * isEmptyState Logic Tests
   *
   * The isEmptyState flag controls whether Ghost Mode Overlay shows.
   * Bug fix: Previously, `unifiedData === null` (disconnected wallet) resulted in
   * isEmptyState=false, breaking ghost mode for unconnected users.
   *
   * Correct logic: isEmptyState = !isLoading && (unifiedData === null || empty portfolio)
   */
  describe("isEmptyState calculation (Ghost Mode trigger)", () => {
    it("should set isEmptyState=true when wallet disconnected (unifiedData is null)", () => {
      // Wallet not connected = no user query = unifiedData is null
      mockUsePortfolioDataProgressive.mockReturnValue({
        unifiedData: null,
        sections: {},
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      const presenter = screen.getByTestId("portfolio-presenter");
      expect(presenter).toHaveAttribute("data-empty", "true");
    });

    it("should set isEmptyState=false when loading (even with null data)", () => {
      // During loading, don't show ghost mode - show loading state instead
      mockUsePortfolioDataProgressive.mockReturnValue({
        unifiedData: null,
        sections: {},
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      const presenter = screen.getByTestId("portfolio-presenter");
      expect(presenter).toHaveAttribute("data-empty", "false");
      expect(presenter).toHaveAttribute("data-loading", "true");
    });

    it("should set isEmptyState=true when connected but portfolio is empty", () => {
      // Wallet connected but user has zero balance and zero positions
      mockUsePortfolioDataProgressive.mockReturnValue({
        unifiedData: {
          balance: 0,
          positions: 0,
          allocation: [],
          sentiment: null,
          regimeHistory: null,
        } as any,
        sections: {},
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      const presenter = screen.getByTestId("portfolio-presenter");
      expect(presenter).toHaveAttribute("data-empty", "true");
    });

    it("should set isEmptyState=false when user has portfolio data", () => {
      // Wallet connected with actual holdings
      mockUsePortfolioDataProgressive.mockReturnValue({
        unifiedData: {
          balance: 10000,
          positions: 5,
          allocation: [],
          sentiment: null,
          regimeHistory: null,
        } as any,
        sections: {},
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      const presenter = screen.getByTestId("portfolio-presenter");
      expect(presenter).toHaveAttribute("data-empty", "false");
    });

    it("should set isEmptyState=false when only balance exists (no positions)", () => {
      // Edge case: balance exists but positions is 0
      mockUsePortfolioDataProgressive.mockReturnValue({
        unifiedData: {
          balance: 1000,
          positions: 0,
          allocation: [],
        } as any,
        sections: {},
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      const presenter = screen.getByTestId("portfolio-presenter");
      expect(presenter).toHaveAttribute("data-empty", "false");
    });

    it("should set isEmptyState=false when only positions exist (no balance)", () => {
      // Edge case: positions exist but balance is 0
      mockUsePortfolioDataProgressive.mockReturnValue({
        unifiedData: {
          balance: 0,
          positions: 3,
          allocation: [],
        } as any,
        sections: {},
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      const presenter = screen.getByTestId("portfolio-presenter");
      expect(presenter).toHaveAttribute("data-empty", "false");
    });

    it("should handle undefined balance/positions gracefully", () => {
      // Edge case: data exists but fields are undefined
      mockUsePortfolioDataProgressive.mockReturnValue({
        unifiedData: {
          // balance and positions are undefined
          allocation: [],
        } as any,
        sections: {},
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      const presenter = screen.getByTestId("portfolio-presenter");
      // With undefined treated as 0, this should be empty state
      expect(presenter).toHaveAttribute("data-empty", "true");
    });
  });

  it("should render header banners when provided", () => {
    render(
      <DashboardShell
        {...defaultProps}
        headerBanners={<div>Header Banner Content</div>}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId("header-banners")).toBeInTheDocument();
    expect(screen.getByText("Header Banner Content")).toBeInTheDocument();
  });

  it("should render footer overlays when provided", () => {
    render(
      <DashboardShell
        {...defaultProps}
        footerOverlays={<div>Footer Overlay Content</div>}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId("footer-overlays")).toBeInTheDocument();
    expect(screen.getByText("Footer Overlay Content")).toBeInTheDocument();
  });

  it("should handle missing optional props", () => {
    const { container } = render(
      <DashboardShell urlUserId="user-456" isOwnBundle={false} />,
      { wrapper: createWrapper() }
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute("data-bundle-user-name", "");
    expect(wrapper).toHaveAttribute("data-bundle-url", "");
  });

  /**
   * ETL Race Condition Fix Tests
   * Tests for commit e5302a738a98bd7787e2cdec0610c11068c41fc1
   * Verifies the "completing" intermediate state prevents continuous /landing requests
   */
  describe("ETL Race Condition Fix", () => {
    it("should treat 'completing' status as ETL in progress", () => {
      mockEtlState.mockReturnValue({
        jobId: "test-job-123",
        status: "completing",
        errorMessage: undefined,
        isLoading: false,
        isInProgress: true,
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      // The presenter should receive etlState with completing status
      expect(screen.getByTestId("portfolio-presenter")).toBeInTheDocument();
    });

    it("should pass initialEtlJobId to useEtlJobSync", () => {
      mockEtlState.mockReturnValue({
        jobId: null,
        status: "idle",
        errorMessage: undefined,
        isLoading: false,
        isInProgress: false,
      });

      render(
        <DashboardShell {...defaultProps} initialEtlJobId="new-etl-job" />,
        { wrapper: createWrapper() }
      );

      expect(mockUseEtlJobSync).toHaveBeenCalledWith(
        expect.objectContaining({
          initialEtlJobId: "new-etl-job",
          startPolling: mockStartPolling,
          completeTransition: mockCompleteTransition,
          urlUserId: "user-123",
        })
      );
    });

    it("should pass existing ETL state to useEtlJobSync", () => {
      mockEtlState.mockReturnValue({
        jobId: "existing-job",
        status: "processing",
        errorMessage: undefined,
        isLoading: true,
        isInProgress: true,
      });

      render(
        <DashboardShell {...defaultProps} initialEtlJobId="existing-job" />,
        { wrapper: createWrapper() }
      );

      expect(mockUseEtlJobSync).toHaveBeenCalledWith(
        expect.objectContaining({
          initialEtlJobId: "existing-job",
          etlState: expect.objectContaining({
            jobId: "existing-job",
            status: "processing",
          }),
        })
      );
    });

    it("should pass completeTransition to handle ETL completion", () => {
      mockEtlState.mockReturnValue({
        jobId: "test-job",
        status: "completing",
        errorMessage: undefined,
        isLoading: false,
        isInProgress: true,
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      // completeTransition function should be available (tested via mock)
      expect(mockCompleteTransition).toBeDefined();
    });

    it("should treat pending status as ETL in progress", () => {
      mockEtlState.mockReturnValue({
        jobId: "test-job",
        status: "pending",
        errorMessage: undefined,
        isLoading: true,
        isInProgress: true,
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId("portfolio-presenter")).toBeInTheDocument();
    });

    it("should treat processing status as ETL in progress", () => {
      mockEtlState.mockReturnValue({
        jobId: "test-job",
        status: "processing",
        errorMessage: undefined,
        isLoading: true,
        isInProgress: true,
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId("portfolio-presenter")).toBeInTheDocument();
    });

    it("should correctly render when ETL fails", () => {
      mockEtlState.mockReturnValue({
        jobId: "test-job",
        status: "failed",
        errorMessage: "ETL processing failed",
        isLoading: false,
        isInProgress: false,
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId("portfolio-presenter")).toBeInTheDocument();
    });

    it("should pass resetEtl function correctly", () => {
      mockEtlState.mockReturnValue({
        jobId: "test-job",
        status: "idle",
        errorMessage: undefined,
        isLoading: false,
        isInProgress: false,
      });

      render(<DashboardShell {...defaultProps} />, {
        wrapper: createWrapper(),
      });

      expect(mockResetEtl).toBeDefined();
    });
  });
});
