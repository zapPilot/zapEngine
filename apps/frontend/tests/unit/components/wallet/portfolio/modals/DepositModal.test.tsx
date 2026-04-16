import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DepositModal } from "@/components/wallet/portfolio/modals/DepositModal";
import { useTransactionData } from "@/components/wallet/portfolio/modals/hooks/useTransactionData";
import * as modalDeps from "@/components/wallet/portfolio/modals/transactionModalDependencies";

const mockUseWalletProvider = vi.fn(() => ({
  isConnected: true,
}));

vi.mock("@/providers/WalletProvider", () => ({
  useWalletProvider: () => mockUseWalletProvider(),
}));

const mockTransactionData = {
  chainList: [
    { chainId: 1, name: "Ethereum", symbol: "ETH" },
    { chainId: 42161, name: "Arbitrum", symbol: "ETH" },
  ],
  selectedChain: { chainId: 1, name: "Ethereum" },
  availableTokens: [{ symbol: "USDC", address: "0x123", usdPrice: 1 }],
  selectedToken: { symbol: "USDC", address: "0x123", usdPrice: 1 },
  tokenQuery: { data: [], isLoading: false },
  balances: {},
  balanceQuery: { data: { balance: "1000" }, isLoading: false },
  usdAmount: 100,
  isLoadingTokens: false,
  isLoadingBalance: false,
  isLoading: false,
};

vi.mock(
  "@/components/wallet/portfolio/modals/hooks/useTransactionForm",
  () => ({
    useTransactionForm: vi.fn(() => ({
      formState: { isValid: true },
      control: {},
      setValue: vi.fn(),
      handleSubmit: vi.fn(cb => () => cb()),
      watch: vi.fn((field: string) => {
        if (field === "chainId") return 1;
        if (field === "tokenAddress") return "0x123";
        if (field === "amount") return "100";
        return "";
      }),
    })),
  })
);

vi.mock(
  "@/components/wallet/portfolio/modals/hooks/useTransactionSubmission",
  () => ({
    useTransactionSubmission: vi.fn(() => ({
      status: "idle",
      result: null,
      isSubmitting: false,
      isSubmitDisabled: false,
      handleSubmit: vi.fn(),
      resetState: vi.fn(),
    })),
  })
);

vi.mock("@/services", () => ({
  transactionServiceMock: {
    simulateDeposit: vi.fn(),
  },
}));

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

vi.mock("@/components/ui", async () => {
  const actual = await vi.importActual<any>("@/components/ui");
  return {
    ...actual,
    AppImage: ({ alt, ...props }: { alt: string }) => (
      <img alt={alt} data-testid="chain-logo" {...props} />
    ),
  };
});

const mockDropdownState = {
  dropdownRef: { current: null },
  isAssetDropdownOpen: false,
  isChainDropdownOpen: false,
  toggleAssetDropdown: vi.fn(),
  toggleChainDropdown: vi.fn(),
  closeDropdowns: vi.fn(),
};

const mockUseTransactionModalState = {
  isConnected: true,
  dropdownState: mockDropdownState,
};

vi.mock(
  "@/components/wallet/portfolio/modals/transactionModalDependencies",
  () => ({
    buildModalFormState: vi.fn(() => ({
      handlePercentage: vi.fn(),
      isValid: true,
    })),
    resolveActionLabel: vi.fn().mockReturnValue("Review & Deposit"),
    useTransactionModalState: vi.fn(),
    useTransactionData: vi.fn(),
    TransactionModalContent: ({
      modalState,
      assetContent,
    }: {
      modalState: {
        selectedChain?: { name?: string };
        transactionData?: { selectedToken?: { symbol?: string } };
      };
      assetContent?: React.ReactNode;
    }) => (
      <div data-testid="transaction-modal-content">
        <button data-testid="selector-network" data-open="false">
          {modalState.selectedChain?.name ?? "Network"}
        </button>
        <button data-testid="selector-asset" data-open="false">
          {modalState.transactionData?.selectedToken?.symbol ?? "Asset"}
        </button>
        {assetContent}
        <div data-testid="form-actions">Form Actions</div>
      </div>
    ),
    TokenOptionButton: ({
      symbol,
      balanceLabel,
      onSelect,
    }: {
      symbol: string;
      balanceLabel: string;
      isSelected?: boolean;
      onSelect: () => void;
    }) => (
      <div data-testid="token-option" onClick={onSelect}>
        {symbol} {balanceLabel}
      </div>
    ),
    EmptyAssetsMessage: () => (
      <div data-testid="empty-assets">No assets found.</div>
    ),
  })
);

vi.mock(
  "@/components/wallet/portfolio/modals/hooks/useTransactionData",
  () => ({
    useTransactionData: vi.fn(),
  })
);

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe("DepositModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(modalDeps.useTransactionModalState).mockReturnValue(
      mockUseTransactionModalState
    );
    vi.mocked(useTransactionData).mockReturnValue(mockTransactionData);
  });

  it("should not render when isOpen is false", () => {
    render(<DepositModal isOpen={false} onClose={vi.fn()} />, { wrapper });

    expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
  });

  it("should render when isOpen is true", () => {
    render(<DepositModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByTestId("modal")).toBeInTheDocument();
  });

  it("should render modal header with title", () => {
    render(<DepositModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByText("Deposit to Pilot")).toBeInTheDocument();
  });

  it("should render network and asset selectors", () => {
    render(<DepositModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByTestId("selector-network")).toBeInTheDocument();
    expect(screen.getByTestId("selector-asset")).toBeInTheDocument();
  });

  it("should display selected chain name", () => {
    render(<DepositModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByText(/Ethereum/)).toBeInTheDocument();
  });

  it("should display selected token symbol", () => {
    render(<DepositModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByText(/USDC/)).toBeInTheDocument();
  });

  it("should render form actions", () => {
    render(<DepositModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByTestId("form-actions")).toBeInTheDocument();
  });

  it("should render token options when tokens are available", () => {
    vi.mocked(useTransactionData).mockReturnValue({
      ...mockTransactionData,
      tokenQuery: {
        data: [{ address: "0x1", symbol: "BTC", balance: "1.0" }],
        isLoading: false,
      },
      balanceQuery: { data: { balance: "1.0" }, isLoading: false },
    });

    render(<DepositModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByTestId("token-option")).toBeInTheDocument();
    expect(screen.getByText(/BTC 1.0 available/)).toBeInTheDocument();
  });

  it("should render empty assets message when no tokens are available", () => {
    vi.mocked(useTransactionData).mockReturnValue({
      ...mockTransactionData,
      tokenQuery: { data: [], isLoading: false },
    });

    render(<DepositModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByTestId("empty-assets")).toBeInTheDocument();
  });

  it("should call onSelect and close dropdown when token is clicked", () => {
    vi.mocked(useTransactionData).mockReturnValue({
      ...mockTransactionData,
      tokenQuery: {
        data: [{ address: "0x1", symbol: "BTC", balance: "1.0" }],
        isLoading: false,
      },
    });

    render(<DepositModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    fireEvent.click(screen.getByTestId("token-option"));

    expect(mockDropdownState.closeDropdowns).toHaveBeenCalled();
  });
});
