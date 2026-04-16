/**
 * Unit tests for TransactionModalBase component
 *
 * Focus on:
 * - Auto-selection of first token when tokens load
 * - Form validation state management
 * - Submit button enabled/disabled states
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TransactionModalBase } from "@/components/wallet/portfolio/modals/base/TransactionModalBase";

// Store mock implementations to control test behavior
let mockFormSetValue: ReturnType<typeof vi.fn>;
let mockFormWatch: ReturnType<typeof vi.fn>;
let mockAvailableTokens: {
  symbol: string;
  address: string;
  usdPrice: number;
}[];
let mockTokenAddress: string;
let mockIsConnected: boolean;
let mockResetState: ReturnType<typeof vi.fn>;
let mockIsSubmitting: boolean;
let mockStatus: string;

function getMockTransactionData() {
  return {
    chainList: [{ chainId: 1, name: "Ethereum", symbol: "ETH" }],
    selectedChain: { chainId: 1, name: "Ethereum" },
    availableTokens: mockAvailableTokens,
    selectedToken:
      mockAvailableTokens.find(token => token.address === mockTokenAddress) ||
      mockAvailableTokens[0] ||
      null,
    tokenQuery: { data: mockAvailableTokens, isLoading: false },
    balances: {},
    balanceQuery: { data: { balance: "1000" }, isLoading: false },
    usdAmount: 100,
    isLoadingTokens: false,
    isLoadingBalance: false,
    isLoading: false,
  };
}

// Mock WalletProvider
vi.mock("@/providers/WalletProvider", () => ({
  useWalletProvider: () => ({
    isConnected: mockIsConnected,
  }),
}));

// Mock useTransactionForm - make setValue and watch accessible for testing
vi.mock(
  "@/components/wallet/portfolio/modals/hooks/useTransactionForm",
  () => ({
    useTransactionForm: vi.fn(() => {
      mockFormSetValue = vi.fn();
      mockFormWatch = vi.fn((field: string) => {
        if (field === "chainId") return 1;
        if (field === "tokenAddress") return mockTokenAddress;
        if (field === "amount") return "100";
        return "";
      });
      return {
        formState: { isValid: mockTokenAddress.length >= 4 },
        control: {},
        setValue: mockFormSetValue,
        handleSubmit: vi.fn(cb => () => cb()),
        watch: mockFormWatch,
      };
    }),
  })
);

// Mock useTransactionData - make availableTokens controllable
vi.mock(
  "@/components/wallet/portfolio/modals/hooks/useTransactionData",
  () => ({
    useTransactionData: vi.fn(() => getMockTransactionData()),
  })
);

// Mock useTransactionSubmission
vi.mock(
  "@/components/wallet/portfolio/modals/hooks/useTransactionSubmission",
  () => ({
    useTransactionSubmission: vi.fn(() => {
      mockResetState = vi.fn();
      return {
        status: mockStatus,
        result: null,
        isSubmitting: mockIsSubmitting,
        isSubmitDisabled: mockTokenAddress.length < 4,
        handleSubmit: vi.fn(),
        resetState: mockResetState,
      };
    }),
  })
);

// Mock Modal components
vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    children,
    isOpen,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
  }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
  ModalContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="modal-content" className={className}>
      {children}
    </div>
  ),
}));

// Mock TransactionModalParts
vi.mock(
  "@/components/wallet/portfolio/modals/components/TransactionModalParts",
  () => ({
    TransactionModalHeader: ({
      title,
      onClose,
    }: {
      title: string;
      onClose: () => void;
    }) => (
      <div data-testid="modal-header">
        <span>{title}</span>
        <button onClick={onClose} data-testid="close-button">
          Close
        </button>
      </div>
    ),
    SubmittingState: ({
      isSuccess,
      successMessage,
    }: {
      isSuccess: boolean;
      successMessage?: string;
    }) => (
      <div data-testid="submitting-state">
        {isSuccess ? successMessage : "Processing..."}
      </div>
    ),
  })
);

describe("TransactionModalBase", () => {
  const mockSubmitFn = vi.fn().mockResolvedValue({ success: true });
  const mockOnClose = vi.fn();

  const renderComponent = (childContent = "Child Content") => {
    return render(
      <TransactionModalBase
        isOpen={true}
        onClose={mockOnClose}
        title="Test Modal"
        indicatorColor="bg-green-500"
        submitFn={mockSubmitFn}
      >
        {({ form, transactionData, isSubmitDisabled }) => (
          <div>
            <div data-testid="child-content">{childContent}</div>
            <div data-testid="selected-token">
              {transactionData.selectedToken?.symbol || "No Token"}
            </div>
            <div data-testid="submit-disabled">
              {isSubmitDisabled ? "disabled" : "enabled"}
            </div>
            <div data-testid="token-address">{form.watch("tokenAddress")}</div>
          </div>
        )}
      </TransactionModalBase>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default state
    mockAvailableTokens = [];
    mockTokenAddress = "";
    mockIsConnected = true;
    mockIsSubmitting = false;
    mockStatus = "idle";
  });

  describe("Auto-selection of first token", () => {
    it("should auto-select first token when tokens load and tokenAddress is empty", async () => {
      // Start with no tokens
      mockAvailableTokens = [];
      mockTokenAddress = "";

      const { rerender } = renderComponent();

      // Verify no token is selected initially
      expect(mockFormSetValue).not.toHaveBeenCalled();

      // Simulate tokens loading by updating the mock
      mockAvailableTokens = [
        { symbol: "USDC", address: "0x1234567890abcdef", usdPrice: 1 },
        { symbol: "ETH", address: "0xabcdefabcdef1234", usdPrice: 2000 },
      ];

      // Re-render to trigger useEffect with new tokens
      await act(async () => {
        rerender(
          <TransactionModalBase
            isOpen={true}
            onClose={mockOnClose}
            title="Test Modal"
            indicatorColor="bg-green-500"
            submitFn={mockSubmitFn}
          >
            {({ transactionData }) => (
              <div>
                <div data-testid="available-tokens-count">
                  {transactionData.availableTokens.length}
                </div>
              </div>
            )}
          </TransactionModalBase>
        );
      });

      // Should have called setValue to auto-select first token
      await waitFor(() => {
        expect(mockFormSetValue).toHaveBeenCalledWith(
          "tokenAddress",
          "0x1234567890abcdef",
          { shouldValidate: true }
        );
      });
    });

    it("should NOT auto-select if tokenAddress is already set", async () => {
      // Start with a token already selected
      mockTokenAddress = "0xexistingaddress1234";
      mockAvailableTokens = [
        { symbol: "USDC", address: "0x1234567890abcdef", usdPrice: 1 },
      ];

      renderComponent();

      // Should NOT call setValue since tokenAddress is already set
      expect(mockFormSetValue).not.toHaveBeenCalledWith(
        "tokenAddress",
        expect.any(String),
        expect.any(Object)
      );
    });

    it("should NOT auto-select if availableTokens is empty", async () => {
      mockAvailableTokens = [];
      mockTokenAddress = "";

      renderComponent();

      // Should NOT call setValue since no tokens available
      expect(mockFormSetValue).not.toHaveBeenCalled();
    });
  });

  describe("Form validation and submit button state", () => {
    it("should enable submit button when token is auto-selected", async () => {
      // Initially no token
      mockTokenAddress = "";
      mockAvailableTokens = [
        { symbol: "USDC", address: "0x1234567890abcdef", usdPrice: 1 },
      ];

      renderComponent();

      // After auto-selection, the form should become valid
      await waitFor(() => {
        expect(mockFormSetValue).toHaveBeenCalledWith(
          "tokenAddress",
          "0x1234567890abcdef",
          { shouldValidate: true }
        );
      });
    });

    it("should show correct submit button state based on token selection", () => {
      // With valid token address
      mockTokenAddress = "0x1234567890abcdef";
      mockAvailableTokens = [
        { symbol: "USDC", address: "0x1234567890abcdef", usdPrice: 1 },
      ];

      renderComponent();

      expect(screen.getByTestId("submit-disabled")).toHaveTextContent(
        "enabled"
      );
    });

    it("should show disabled submit button when no token is selected", () => {
      // Empty token address (less than 4 chars)
      mockTokenAddress = "";
      mockAvailableTokens = [];

      renderComponent();

      expect(screen.getByTestId("submit-disabled")).toHaveTextContent(
        "disabled"
      );
    });
  });

  describe("Modal rendering", () => {
    it("should render when isOpen is true", () => {
      mockTokenAddress = "0x123456";
      mockAvailableTokens = [
        { symbol: "USDC", address: "0x123456", usdPrice: 1 },
      ];

      renderComponent();

      expect(screen.getByTestId("modal")).toBeInTheDocument();
      expect(screen.getByTestId("modal-header")).toBeInTheDocument();
    });

    it("should display selected token in child render prop", () => {
      mockTokenAddress = "0x1234567890abcdef";
      mockAvailableTokens = [
        { symbol: "USDC", address: "0x1234567890abcdef", usdPrice: 1 },
      ];

      renderComponent();

      expect(screen.getByTestId("selected-token")).toHaveTextContent("USDC");
    });
  });

  describe("Reset state and close handling", () => {
    it("calls resetState when close button is clicked", () => {
      mockTokenAddress = "0x123456";
      mockAvailableTokens = [
        { symbol: "USDC", address: "0x123456", usdPrice: 1 },
      ];

      renderComponent();

      const closeButton = screen.getByTestId("close-button");
      fireEvent.click(closeButton);

      expect(mockResetState).toHaveBeenCalled();
    });
  });

  describe("Submitting state rendering", () => {
    it("shows SubmittingState when isSubmitting is true", () => {
      mockIsSubmitting = true;
      mockStatus = "idle";
      mockTokenAddress = "0x123456";
      mockAvailableTokens = [
        { symbol: "USDC", address: "0x123456", usdPrice: 1 },
      ];

      renderComponent();

      expect(screen.getByTestId("submitting-state")).toBeInTheDocument();
      expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
    });

    it("shows SubmittingState with success message when status is success", () => {
      mockIsSubmitting = true;
      mockStatus = "success";
      mockTokenAddress = "0x123456";
      mockAvailableTokens = [
        { symbol: "USDC", address: "0x123456", usdPrice: 1 },
      ];

      render(
        <TransactionModalBase
          isOpen={true}
          onClose={mockOnClose}
          title="Test Modal"
          indicatorColor="bg-green-500"
          submitFn={mockSubmitFn}
          successMessage="Deposit Complete"
        >
          {() => <div data-testid="child-content">Child Content</div>}
        </TransactionModalBase>
      );

      expect(screen.getByTestId("submitting-state")).toBeInTheDocument();
      expect(screen.getByText("Deposit Complete")).toBeInTheDocument();
    });
  });
});
