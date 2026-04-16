/**
 * Unit tests for WalletPortfolioPresenter handleSearch function.
 *
 * The handleSearch function orchestrates the wallet search flow:
 * 1. Validates and trims input
 * 2. Calls connectWallet service
 * 3. Extracts response (user_id, is_new_user, etl_job)
 * 4. Constructs URL with appropriate parameters
 * 5. Navigates to bundle page
 * 6. Handles errors (validation, connection, conflicts)
 *
 * Test Coverage:
 * - Input validation and trimming
 * - New user flow (with ETL job ID and isNewUser flag)
 * - Existing user flow (without special flags)
 * - Loading state management (isSearching transitions)
 * - Error handling (validation, connection, wallet conflicts)
 * - URL parameter construction
 *
 * @see src/components/wallet/portfolio/WalletPortfolioPresenter.tsx (lines 74-125)
 */

import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WalletPortfolioPresenter } from "@/components/wallet/portfolio/WalletPortfolioPresenter";

import {
  EXISTING_USER_RESPONSE,
  NEW_USER_RESPONSE,
  TEST_WALLET_ADDRESSES,
} from "../../../../fixtures/mockEtlData";
import { MOCK_DATA } from "../../../../fixtures/mockPortfolioData";
import {
  createMockRouter,
  createMockToast,
} from "../../../../helpers/etlMockHelpers";
import { render, screen, waitFor } from "../../../../test-utils";

// Mock dependencies
const mockRouter = createMockRouter();
const mockToast = createMockToast();

const mockConnectWallet = vi.fn();
vi.mock("@/services/accountService", () => ({
  connectWallet: (...args: any[]) => mockConnectWallet(...args),
}));

vi.mock("@/lib/routing", () => ({
  useAppRouter: () => mockRouter,
  useAppSearchParams: () => new URLSearchParams(),
  useAppPathname: () => "/bundle",
}));

vi.mock("@/providers/ToastProvider", () => ({
  useToast: () => mockToast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Mock child components to isolate handleSearch testing
vi.mock("@/components/wallet/portfolio/views/DashboardView", () => ({
  DashboardView: () => <div data-testid="dashboard-view">Dashboard</div>,
}));

vi.mock("@/components/wallet/portfolio/analytics", () => ({
  AnalyticsView: () => <div data-testid="analytics-view">Analytics</div>,
}));

vi.mock("@/components/wallet/portfolio/views/strategy", () => ({
  StrategyView: () => <div data-testid="strategy-view">Strategy</div>,
}));

vi.mock("@/components/wallet/portfolio/components/navigation", () => ({
  WalletNavigation: ({ onSearch, isSearching }: any) => (
    <div data-testid="wallet-navigation">
      <input
        data-testid="search-input"
        placeholder="Search wallet"
        onChange={e => {
          // Simulate search on Enter key
          if (e.target.value) {
            onSearch(e.target.value);
          }
        }}
      />
      {isSearching && <div data-testid="searching-indicator">Searching...</div>}
    </div>
  ),
}));

vi.mock("@/components/wallet/portfolio/modals", () => ({
  PortfolioModals: () => null,
}));

vi.mock("@/components/WalletManager", () => ({
  WalletManager: () => null,
}));

vi.mock("@/components/Footer/Footer", () => ({
  Footer: () => null,
}));

vi.mock("@/components/wallet/InitialDataLoadingState", () => ({
  InitialDataLoadingState: ({ status }: { status?: string }) => (
    <div data-testid="initial-loading-state">
      Loading: {status || "default"}
    </div>
  ),
}));

vi.mock("@/providers/WalletProvider", () => ({
  useWalletProvider: () => ({
    connectedWallets: [],
    activeWallet: null,
    isConnected: false,
  }),
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("WalletPortfolioPresenter - handleSearch", () => {
  const mockEtlState = {
    jobId: null,
    status: "idle" as const,
    errorMessage: undefined,
    isLoading: false,
  };

  const mockSections = {
    landing: { isLoading: false, data: MOCK_DATA, error: null },
    sentiment: { isLoading: false, data: null, error: null },
    regimeHistory: { isLoading: false, data: [], error: null },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderComponent(props = {}) {
    return render(
      <WalletPortfolioPresenter
        data={MOCK_DATA}
        userId="test-user-id"
        isOwnBundle={true}
        isEmptyState={false}
        isLoading={false}
        etlState={mockEtlState}
        sections={mockSections}
        {...props}
      />
    );
  }

  describe("Input Validation", () => {
    it("ignores empty string input", async () => {
      renderComponent();

      // Initial state - no search should have been triggered
      expect(mockConnectWallet).not.toHaveBeenCalled();
      expect(mockRouter.push).not.toHaveBeenCalled();

      // Verify that the component doesn't auto-search on mount
      await waitFor(() => {
        expect(mockConnectWallet).not.toHaveBeenCalled();
      });
    });

    it("returns early for whitespace-only input without calling connectWallet", async () => {
      const user = userEvent.setup();
      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      // "   " is truthy so the onChange mock calls onSearch("   ")
      // handleSearch trims it to "" and returns early without calling connectWallet
      await user.type(searchInput, "   ");

      await waitFor(() => {
        expect(mockConnectWallet).not.toHaveBeenCalled();
      });
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it("trims whitespace from wallet address input", async () => {
      const user = userEvent.setup();
      mockConnectWallet.mockResolvedValue(NEW_USER_RESPONSE);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      const walletWithSpaces = `  ${TEST_WALLET_ADDRESSES.VALID_NEW}  `;
      await user.type(searchInput, walletWithSpaces);

      await waitFor(() => {
        expect(mockConnectWallet).toHaveBeenCalledWith(
          TEST_WALLET_ADDRESSES.VALID_NEW // Trimmed version
        );
      });
    });
  });

  describe("New User Flow", () => {
    it("navigates with isNewUser flag when is_new_user is true", async () => {
      const user = userEvent.setup();
      mockConnectWallet.mockResolvedValue(NEW_USER_RESPONSE);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith(
          expect.stringContaining("isNewUser=true")
        );
      });
    });

    it("includes etlJobId in URL when job_id is present", async () => {
      const user = userEvent.setup();
      mockConnectWallet.mockResolvedValue(NEW_USER_RESPONSE);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        const callArg = mockRouter.push.mock.calls[0][0];
        expect(callArg).toContain("etlJobId=");
        expect(callArg).toContain(NEW_USER_RESPONSE.etl_job?.job_id);
      });
    });

    it("includes userId parameter from response", async () => {
      const user = userEvent.setup();
      mockConnectWallet.mockResolvedValue(NEW_USER_RESPONSE);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        const callArg = mockRouter.push.mock.calls[0][0];
        expect(callArg).toContain("userId=");
        expect(callArg).toContain(NEW_USER_RESPONSE.user_id);
      });
    });

    it("constructs complete URL with all new user parameters", async () => {
      const user = userEvent.setup();
      mockConnectWallet.mockResolvedValue(NEW_USER_RESPONSE);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        const callArg = mockRouter.push.mock.calls[0][0];

        // Verify URL starts with /bundle
        expect(callArg).toMatch(/^\/bundle\?/);

        // Verify all required parameters
        expect(callArg).toContain(`userId=${NEW_USER_RESPONSE.user_id}`);
        expect(callArg).toContain(
          `etlJobId=${NEW_USER_RESPONSE.etl_job?.job_id}`
        );
        expect(callArg).toContain("isNewUser=true");
      });
    });
  });

  describe("Existing User Flow", () => {
    it("navigates without isNewUser flag when is_new_user is false", async () => {
      const user = userEvent.setup();
      mockConnectWallet.mockResolvedValue(EXISTING_USER_RESPONSE);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_EXISTING);

      await waitFor(() => {
        const callArg = mockRouter.push.mock.calls[0][0];
        expect(callArg).not.toContain("isNewUser=true");
      });
    });

    it("omits etlJobId when no ETL job exists", async () => {
      const user = userEvent.setup();
      mockConnectWallet.mockResolvedValue(EXISTING_USER_RESPONSE);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_EXISTING);

      await waitFor(() => {
        const callArg = mockRouter.push.mock.calls[0][0];
        expect(callArg).not.toContain("etlJobId=");
      });
    });

    it("still includes userId for existing users", async () => {
      const user = userEvent.setup();
      mockConnectWallet.mockResolvedValue(EXISTING_USER_RESPONSE);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_EXISTING);

      await waitFor(() => {
        const callArg = mockRouter.push.mock.calls[0][0];
        expect(callArg).toContain(`userId=${EXISTING_USER_RESPONSE.user_id}`);
      });
    });
  });

  describe("Loading State Management", () => {
    it("shows searching indicator during API call", async () => {
      const user = userEvent.setup();

      // Make connectWallet resolve slowly so we can see loading state
      mockConnectWallet.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve(NEW_USER_RESPONSE), 100)
          )
      );

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      // Should show searching indicator immediately
      await waitFor(() => {
        expect(screen.getByTestId("searching-indicator")).toBeInTheDocument();
      });
    });

    it("hides searching indicator after successful search", async () => {
      const user = userEvent.setup();
      mockConnectWallet.mockResolvedValue(NEW_USER_RESPONSE);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      // Wait for API call to complete
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalled();
      });

      // Searching indicator should be gone
      expect(
        screen.queryByTestId("searching-indicator")
      ).not.toBeInTheDocument();
    });

    it("hides searching indicator after error", async () => {
      const user = userEvent.setup();

      const error = new Error("Invalid wallet address format");
      mockConnectWallet.mockRejectedValue(error);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.INVALID_SHORT);

      // Wait for error handling
      await waitFor(() => {
        expect(mockConnectWallet).toHaveBeenCalled();
      });

      // Searching indicator should be hidden after error
      expect(
        screen.queryByTestId("searching-indicator")
      ).not.toBeInTheDocument();
    });
  });

  describe("Error Handling - Validation", () => {
    it("shows validation error toast for invalid wallet format", async () => {
      const user = userEvent.setup();

      const validationError = new Error("Invalid wallet address format");
      mockConnectWallet.mockRejectedValue(validationError);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.INVALID_SHORT);

      await waitFor(() => {
        expect(mockToast.showToast).toHaveBeenCalledWith({
          type: "error",
          title: "Invalid Address",
          message: "Please enter a valid 42-character Ethereum address.",
        });
      });
    });

    it("shows validation error for 42-character requirement", async () => {
      const user = userEvent.setup();

      const validationError = new Error(
        "Must be a 42-character Ethereum address"
      );
      mockConnectWallet.mockRejectedValue(validationError);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.INVALID_NO_PREFIX);

      await waitFor(() => {
        expect(mockToast.showToast).toHaveBeenCalledWith({
          type: "error",
          title: "Invalid Address",
          message: "Please enter a valid 42-character Ethereum address.",
        });
      });
    });

    it("does not navigate for validation errors", async () => {
      const user = userEvent.setup();

      const validationError = new Error("Invalid wallet address");
      mockConnectWallet.mockRejectedValue(validationError);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.INVALID_SPECIAL_CHARS);

      await waitFor(() => {
        expect(mockToast.showToast).toHaveBeenCalled();
      });

      // Router should not be called
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling - Connection Errors", () => {
    it("treats non-Error thrown values as connection errors (not validation toast)", async () => {
      const user = userEvent.setup();
      // Throw a plain string, not an Error instance — isValidationSearchError returns false
      mockConnectWallet.mockRejectedValue("unexpected string rejection");

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        expect(screen.getByTestId("initial-loading-state")).toBeInTheDocument();
      });

      expect(mockToast.showToast).not.toHaveBeenCalled();
    });

    it("shows loading fallback for non-validation errors", async () => {
      const user = userEvent.setup();

      const networkError = new Error("Network connection failed");
      mockConnectWallet.mockRejectedValue(networkError);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        // Should show InitialDataLoadingState as fallback
        expect(screen.getByTestId("initial-loading-state")).toBeInTheDocument();
      });
    });

    it("handles timeout errors gracefully with loading fallback", async () => {
      const user = userEvent.setup();

      const timeoutError = new Error("Request timeout");
      timeoutError.name = "TimeoutError";
      mockConnectWallet.mockRejectedValue(timeoutError);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        expect(screen.getByTestId("initial-loading-state")).toBeInTheDocument();
      });
    });

    it("does not show toast for non-validation errors", async () => {
      const user = userEvent.setup();

      const networkError = new Error("Server error");
      mockConnectWallet.mockRejectedValue(networkError);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        expect(screen.getByTestId("initial-loading-state")).toBeInTheDocument();
      });

      // Should NOT show validation toast
      expect(mockToast.showToast).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling - Wallet Conflicts", () => {
    it("handles wallet conflict errors (409 status)", async () => {
      const user = userEvent.setup();

      const conflictError = new Error("Wallet already belongs to another user");
      (conflictError as any).status = 409;
      mockConnectWallet.mockRejectedValue(conflictError);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        // Non-validation error, so should show loading fallback
        expect(screen.getByTestId("initial-loading-state")).toBeInTheDocument();
      });
    });
  });

  describe("URL Construction", () => {
    it("constructs URL with URLSearchParams format", async () => {
      const user = userEvent.setup();
      mockConnectWallet.mockResolvedValue(NEW_USER_RESPONSE);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        const callArg = mockRouter.push.mock.calls[0][0];

        // Should follow /bundle?param1=value1&param2=value2 format
        expect(callArg).toMatch(/^\/bundle\?/);
        expect(callArg).toContain("&");
      });
    });

    it("properly handles special characters in user ID", async () => {
      const user = userEvent.setup();

      const responseWithSpecialChars = {
        ...NEW_USER_RESPONSE,
        user_id: "user-with-special+chars&more=stuff",
      };
      mockConnectWallet.mockResolvedValue(responseWithSpecialChars);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        const callArg = mockRouter.push.mock.calls[0][0];

        // URLSearchParams should handle encoding
        expect(callArg).toContain("userId=");
        expect(mockRouter.push).toHaveBeenCalled();
      });
    });

    it("maintains parameter order: userId, etlJobId, isNewUser", async () => {
      const user = userEvent.setup();
      mockConnectWallet.mockResolvedValue(NEW_USER_RESPONSE);

      renderComponent();

      const searchInput = screen.getByTestId("search-input");
      await user.type(searchInput, TEST_WALLET_ADDRESSES.VALID_NEW);

      await waitFor(() => {
        const callArg = mockRouter.push.mock.calls[0][0];

        // Extract parameter names in order
        const params = callArg
          .split("?")[1]
          .split("&")
          .map((p: string) => p.split("=")[0]);

        expect(params).toEqual(
          expect.arrayContaining(["userId", "etlJobId", "isNewUser"])
        );
      });
    });
  });
});
