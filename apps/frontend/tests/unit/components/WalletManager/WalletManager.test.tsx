import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WalletManager } from "@/components/WalletManager/WalletManager";
import { useUser } from "@/contexts/UserContext";
import { useAsyncRetryButton } from "@/hooks/ui/useAsyncRetryButton";

// Mock Child Components
vi.mock("@/components/WalletManager/components/WalletList", () => ({
  WalletList: ({ onAddWallet, onWalletChange, onCancelAdding }: any) => (
    <div data-testid="wallet-list">
      <button onClick={onAddWallet}>Add Wallet</button>
      <button onClick={() => onWalletChange({ label: "changed" })}>
        Change Wallet
      </button>
      <button onClick={onCancelAdding}>Cancel Adding</button>
    </div>
  ),
}));

vi.mock("@/components/WalletManager/contexts/WalletListContext", () => ({
  WalletListProvider: ({ children, onEditWallet }: any) => (
    <div data-testid="wallet-list-provider">
      <button onClick={() => onEditWallet("wallet-id-1", "My Wallet")}>
        Edit Wallet
      </button>
      {children}
    </div>
  ),
}));

vi.mock("@/components/WalletManager/components/EmailSubscription", () => ({
  EmailSubscription: () => <div data-testid="email-subscription" />,
}));

vi.mock("@/components/WalletManager/components/DeleteAccountButton", () => ({
  DeleteAccountButton: () => <div data-testid="delete-account-button" />,
}));

vi.mock("@/components/WalletManager/components/EditWalletModal", () => ({
  EditWalletModal: ({ onClose }: any) => (
    <div data-testid="edit-wallet-modal">
      <button onClick={onClose}>Close Edit Modal</button>
    </div>
  ),
}));

// Mock Hooks
vi.mock("@/contexts/UserContext");
vi.mock("@/hooks/ui/useAsyncRetryButton");

const mockSetNewWallet = vi.fn();
const mockSetEditingWallet = vi.fn();
const mockSetIsAdding = vi.fn();
const mockSetValidationError = vi.fn();

const mockWalletOperationsBase = {
  wallets: [],
  operations: {},
  isRefreshing: false,
  isAdding: false,
  newWallet: { address: "", label: "" },
  editingWallet: null,
  validationError: null,
  isDeletingAccount: false,
  setNewWallet: mockSetNewWallet,
  setEditingWallet: mockSetEditingWallet,
  setIsAdding: mockSetIsAdding,
  setValidationError: mockSetValidationError,
  handleAddWallet: vi.fn(),
  handleDeleteWallet: vi.fn(),
  handleDeleteAccount: vi.fn(),
  handleEditLabel: vi.fn(),
  handleCopyAddress: vi.fn(),
};

const mockUseWalletOperations = vi.fn(() => ({ ...mockWalletOperationsBase }));

vi.mock("@/components/WalletManager/hooks/useWalletOperations", () => ({
  get useWalletOperations() {
    return mockUseWalletOperations;
  },
}));

vi.mock("@/components/WalletManager/hooks/useEmailSubscription", () => ({
  useEmailSubscription: () => ({
    email: "test@example.com",
    subscribedEmail: "test@example.com",
    isEditingSubscription: false,
    subscriptionOperation: null,
    handleSubscribe: vi.fn(),
    handleUnsubscribe: vi.fn(),
    setEmail: vi.fn(),
    startEditingSubscription: vi.fn(),
    cancelEditingSubscription: vi.fn(),
  }),
}));

vi.mock("@/components/WalletManager/hooks/useDropdownMenu", () => ({
  useDropdownMenu: () => ({
    openDropdown: null,
    menuPosition: {},
    toggleDropdown: vi.fn(),
    closeDropdown: vi.fn(),
  }),
}));

describe("WalletManager", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    urlUserId: "user-1",
    onEmailSubscribed: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUser).mockReturnValue({
      userInfo: { userId: "user-1" },
      loading: false,
      error: null,
      isConnected: true,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useAsyncRetryButton).mockReturnValue({
      handleRetry: vi.fn(),
      isRetrying: false,
    } as any);
  });

  it("returns null if not open", () => {
    const { container } = render(
      <WalletManager {...defaultProps} isOpen={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders loading skeleton when loading", () => {
    vi.mocked(useUser).mockReturnValue({
      userInfo: { userId: "user-1" },
      loading: true,
      error: null,
      isConnected: true,
      refetch: vi.fn(),
    } as any);

    render(<WalletManager {...defaultProps} />);
    expect(screen.getByText("Loading bundled wallets...")).toBeInTheDocument();
  });

  it("renders refreshing text when isRefreshing is true", () => {
    mockUseWalletOperations.mockReturnValueOnce({
      ...mockWalletOperationsBase,
      isRefreshing: true,
    } as any);

    render(<WalletManager {...defaultProps} />);
    expect(screen.getByText("Refreshing wallets...")).toBeInTheDocument();
  });

  it("renders content when loaded", () => {
    render(<WalletManager {...defaultProps} />);
    expect(screen.getByText("Bundled Wallets")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-list")).toBeInTheDocument();
  });

  it("renders error state", () => {
    vi.mocked(useUser).mockReturnValue({
      userInfo: { userId: "user-1" },
      loading: false,
      error: "Failed to load",
      isConnected: true,
      refetch: vi.fn(),
    } as any);

    render(<WalletManager {...defaultProps} />);
    expect(screen.getByText("Failed to load")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows Retrying... text on error state when isRetrying is true", () => {
    vi.mocked(useUser).mockReturnValue({
      userInfo: { userId: "user-1" },
      loading: false,
      error: "Failed to load",
      isConnected: true,
      refetch: vi.fn(),
    } as any);
    vi.mocked(useAsyncRetryButton).mockReturnValue({
      handleRetry: vi.fn(),
      isRetrying: true,
    } as any);

    render(<WalletManager {...defaultProps} />);
    expect(screen.getByText("Retrying...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
  });

  it("renders owner exclusive components", () => {
    render(<WalletManager {...defaultProps} urlUserId="user-1" />);

    expect(screen.getByTestId("email-subscription")).toBeInTheDocument();
    expect(screen.getByTestId("delete-account-button")).toBeInTheDocument();
  });

  it("hides owner components for viewer - shows 'Viewing wallet bundle' description", () => {
    vi.mocked(useUser).mockReturnValue({
      userInfo: { userId: "user-2" },
      loading: false,
      error: null,
      isConnected: true,
      refetch: vi.fn(),
    } as any);

    render(<WalletManager {...defaultProps} urlUserId="user-1" />);

    // Covers the getWalletDescription branch: connected=true, owner=false => "Viewing wallet bundle"
    expect(screen.getByText("Viewing wallet bundle")).toBeInTheDocument();
    expect(screen.queryByTestId("email-subscription")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("delete-account-button")
    ).not.toBeInTheDocument();
  });

  it("shows 'No wallet connected' when not connected", () => {
    vi.mocked(useUser).mockReturnValue({
      userInfo: null,
      loading: false,
      error: null,
      isConnected: false,
      refetch: vi.fn(),
    } as any);

    render(<WalletManager {...defaultProps} urlUserId={undefined} />);

    // Covers the getWalletDescription branch: connected=false => "No wallet connected"
    expect(screen.getByText("No wallet connected")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<WalletManager {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close wallet manager"));
    expect(onClose).toHaveBeenCalled();
  });

  it("invokes the onRetry async callback passed to useAsyncRetryButton, calling refetch", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useUser).mockReturnValue({
      userInfo: { userId: "user-1" },
      loading: false,
      error: null,
      isConnected: true,
      refetch,
    } as any);

    // Capture the onRetry function passed to useAsyncRetryButton and invoke it
    let capturedOnRetry: (() => Promise<void>) | undefined;
    vi.mocked(useAsyncRetryButton).mockImplementation(({ onRetry }: any) => {
      capturedOnRetry = onRetry;
      return { handleRetry: vi.fn(), isRetrying: false };
    });

    render(<WalletManager {...defaultProps} />);

    expect(capturedOnRetry).toBeDefined();
    await capturedOnRetry!();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("handleWalletChange merges changes into newWallet via setNewWallet updater", () => {
    render(<WalletManager {...defaultProps} />);

    // The WalletList mock exposes a "Change Wallet" button that calls onWalletChange
    fireEvent.click(screen.getByText("Change Wallet"));

    // setNewWallet should have been called with an updater function
    expect(mockSetNewWallet).toHaveBeenCalledTimes(1);
    const updater = mockSetNewWallet.mock.calls[0][0];
    expect(typeof updater).toBe("function");

    // Execute the updater to cover lines 296-297
    const prev = { address: "0xabc", label: "old" };
    const result = updater(prev);
    expect(result).toEqual({ address: "0xabc", label: "changed" });
  });

  it("handleEditWallet sets editingWallet with walletId and label", () => {
    render(<WalletManager {...defaultProps} />);

    // WalletListProvider mock exposes an "Edit Wallet" button calling onEditWallet
    fireEvent.click(screen.getByText("Edit Wallet"));

    expect(mockSetEditingWallet).toHaveBeenCalledWith({
      id: "wallet-id-1",
      label: "My Wallet",
    });
  });

  it("handleCancelAdding resets adding state and clears new wallet fields", () => {
    render(<WalletManager {...defaultProps} />);

    // WalletList mock exposes a "Cancel Adding" button that calls onCancelAdding
    fireEvent.click(screen.getByText("Cancel Adding"));

    expect(mockSetIsAdding).toHaveBeenCalledWith(false);
    expect(mockSetNewWallet).toHaveBeenCalledWith({ address: "", label: "" });
    expect(mockSetValidationError).toHaveBeenCalledWith(null);
  });

  it("handleCloseEditModal clears the editingWallet state", () => {
    render(<WalletManager {...defaultProps} />);

    // EditWalletModal mock exposes a "Close Edit Modal" button calling onClose
    fireEvent.click(screen.getByText("Close Edit Modal"));

    expect(mockSetEditingWallet).toHaveBeenCalledWith(null);
  });
});
