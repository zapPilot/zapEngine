import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditWalletModal } from "@/components/WalletManager/components/EditWalletModal";
import type {
  EditingWallet,
  WalletOperations,
} from "@/components/WalletManager/types/wallet.types";
import type { WalletData } from "@/lib/validation/walletUtils";

// Mock UI components
vi.mock("@/components/ui", () => ({
  BaseCard: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="base-card" className={className}>
      {children}
    </div>
  ),
  GradientButton: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    gradient?: string;
    className?: string;
  }) => (
    <button data-testid="gradient-button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  LoadingSpinner: () => <span data-testid="loading-spinner" />,
}));

vi.mock("@/components/ui/modal", () => ({
  ModalBackdrop: ({
    children,
    onDismiss,
  }: {
    children: React.ReactNode;
    onDismiss: () => void;
    innerClassName?: string;
  }) => (
    <div data-testid="modal-backdrop" onClick={onDismiss}>
      {children}
    </div>
  ),
}));

vi.mock("@/utils/formatters", () => ({
  formatAddress: vi.fn((addr: string) => `${addr.slice(0, 6)}...`),
}));

const mockWallets: WalletData[] = [
  {
    id: "wallet-1",
    address: "0x1234567890abcdef",
    label: "My Wallet",
    isActive: true,
    isConnected: true,
    source: "connected",
  },
];

const defaultOperations: WalletOperations = {
  editing: {},
  deleting: {},
  adding: {},
  switching: {},
};

const defaultEditingWallet: EditingWallet = {
  id: "wallet-1",
  label: "My Wallet",
};

describe("EditWalletModal", () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when editingWallet is null", () => {
    const { container } = render(
      <EditWalletModal
        editingWallet={null}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders the modal when editingWallet is provided", () => {
    render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    expect(screen.getByText("Edit Wallet Label")).toBeDefined();
  });

  it("initializes input with editingWallet label", () => {
    render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByPlaceholderText("Enter wallet label");
    expect((input as HTMLInputElement).value).toBe("My Wallet");
  });

  it("updates input on change", () => {
    render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByPlaceholderText("Enter wallet label");
    fireEvent.change(input, { target: { value: "New Label" } });

    expect((input as HTMLInputElement).value).toBe("New Label");
  });

  it("calls onSave with wallet id and new label on save click", () => {
    render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByPlaceholderText("Enter wallet label");
    fireEvent.change(input, { target: { value: "Updated" } });
    fireEvent.click(screen.getByTestId("gradient-button"));

    expect(onSave).toHaveBeenCalledWith("wallet-1", "Updated");
  });

  it("calls onSave on Enter key press", () => {
    render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByPlaceholderText("Enter wallet label");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSave).toHaveBeenCalledWith("wallet-1", "My Wallet");
  });

  it("calls onClose on Escape key press", () => {
    render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByPlaceholderText("Enter wallet label");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose and resets label on cancel click", () => {
    render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByText("Cancel"));

    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on X button click", () => {
    render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    // X button is a button with an svg child
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons.find(
      btn =>
        !btn.textContent?.includes("Save") &&
        !btn.textContent?.includes("Cancel")
    );
    if (closeBtn) fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });

  it("disables save button when label is empty", () => {
    render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const input = screen.getByPlaceholderText("Enter wallet label");
    fireEvent.change(input, { target: { value: "   " } });

    const saveButton = screen.getByTestId("gradient-button");
    expect(saveButton.hasAttribute("disabled")).toBe(true);
  });

  it("shows loading state when editing operation is in progress", () => {
    const loadingOperations: WalletOperations = {
      ...defaultOperations,
      editing: { "wallet-1": { isLoading: true } },
    };

    render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={loadingOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    expect(screen.getByText("Saving...")).toBeDefined();
    expect(screen.getByTestId("loading-spinner")).toBeDefined();
  });

  it("displays formatted wallet address", () => {
    render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    expect(screen.getByText(/0x1234/)).toBeDefined();
  });

  it("updates label when editingWallet changes", async () => {
    const { rerender } = render(
      <EditWalletModal
        editingWallet={defaultEditingWallet}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    rerender(
      <EditWalletModal
        editingWallet={{ id: "wallet-1", label: "Changed Label" }}
        wallets={mockWallets}
        operations={defaultOperations}
        onSave={onSave}
        onClose={onClose}
      />
    );

    await waitFor(() => {
      const input = screen.getByPlaceholderText("Enter wallet label");
      expect((input as HTMLInputElement).value).toBe("Changed Label");
    });
  });
});
