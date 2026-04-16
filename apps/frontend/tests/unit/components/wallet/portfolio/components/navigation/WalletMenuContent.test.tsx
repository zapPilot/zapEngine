import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WalletMenuButton,
  WalletMenuDropdown,
} from "@/components/wallet/portfolio/components/navigation/WalletMenuContent";
import { WALLET_LABELS } from "@/constants/wallet";

vi.mock("@/utils/formatters", () => ({
  formatAddress: (addr: string) =>
    `${addr.substring(0, 6)}...${addr.slice(-4)}`,
}));

vi.mock("@/components/WalletManager/components/ConnectWalletButton", () => ({
  ConnectWalletButton: ({ className }: { className?: string }) => (
    <button className={className} data-testid="connect-wallet-btn">
      Connect Wallet Button
    </button>
  ),
}));

vi.mock("@/lib/ui/animationVariants", () => ({
  dropdownMenu: {},
}));

const mockAddress = "0x1234567890abcdef1234567890abcdef12345678";
const mockAddress2 = "0xabcdef1234567890abcdef1234567890abcdef12";

describe("WalletMenuButton", () => {
  const defaultProps = {
    isConnected: false,
    isConnecting: false,
    isMenuOpen: false,
    accountAddress: undefined as string | undefined,
    hasMultipleWallets: false,
    connectedWalletCount: 0,
    onConnectClick: vi.fn(() => Promise.resolve()),
    onToggleMenu: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Disconnected state", () => {
    it("renders the wallet menu button with testid", () => {
      render(<WalletMenuButton {...defaultProps} />);

      expect(
        screen.getByTestId("unified-wallet-menu-button")
      ).toBeInTheDocument();
    });

    it("shows connect label text when not connected", () => {
      render(<WalletMenuButton {...defaultProps} />);

      expect(screen.getByText(WALLET_LABELS.CONNECT)).toBeInTheDocument();
    });

    it("calls onConnectClick when button is clicked while disconnected", () => {
      render(<WalletMenuButton {...defaultProps} />);

      fireEvent.click(screen.getByTestId("unified-wallet-menu-button"));

      expect(defaultProps.onConnectClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onToggleMenu when not connected", () => {
      render(<WalletMenuButton {...defaultProps} />);

      fireEvent.click(screen.getByTestId("unified-wallet-menu-button"));

      expect(defaultProps.onToggleMenu).not.toHaveBeenCalled();
    });

    it("is disabled when isConnecting is true", () => {
      render(<WalletMenuButton {...defaultProps} isConnecting={true} />);

      const button = screen.getByTestId("unified-wallet-menu-button");
      expect(button).toBeDisabled();
    });

    it("has cursor-wait class when isConnecting is true", () => {
      render(<WalletMenuButton {...defaultProps} isConnecting={true} />);

      const button = screen.getByTestId("unified-wallet-menu-button");
      expect(button).toHaveClass("cursor-wait");
    });
  });

  describe("Connected state", () => {
    const connectedProps = {
      ...defaultProps,
      isConnected: true,
      accountAddress: mockAddress,
    };

    it("displays formatted wallet address when connected", () => {
      render(<WalletMenuButton {...connectedProps} />);

      expect(screen.getByText("0x1234...5678")).toBeInTheDocument();
    });

    it("calls onToggleMenu when button is clicked while connected", () => {
      render(<WalletMenuButton {...connectedProps} />);

      fireEvent.click(screen.getByTestId("unified-wallet-menu-button"));

      expect(connectedProps.onToggleMenu).toHaveBeenCalledTimes(1);
    });

    it("does not call onConnectClick when already connected", () => {
      render(<WalletMenuButton {...connectedProps} />);

      fireEvent.click(screen.getByTestId("unified-wallet-menu-button"));

      expect(connectedProps.onConnectClick).not.toHaveBeenCalled();
    });

    it("sets aria-expanded to true when isMenuOpen is true", () => {
      render(<WalletMenuButton {...connectedProps} isMenuOpen={true} />);

      const button = screen.getByTestId("unified-wallet-menu-button");
      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("sets aria-expanded to false when isMenuOpen is false", () => {
      render(<WalletMenuButton {...connectedProps} isMenuOpen={false} />);

      const button = screen.getByTestId("unified-wallet-menu-button");
      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("has aria-haspopup attribute set to menu", () => {
      render(<WalletMenuButton {...connectedProps} />);

      expect(screen.getByTestId("unified-wallet-menu-button")).toHaveAttribute(
        "aria-haspopup",
        "menu"
      );
    });

    it("does not show connect label when connected", () => {
      render(<WalletMenuButton {...connectedProps} />);

      expect(screen.queryByText(WALLET_LABELS.CONNECT)).not.toBeInTheDocument();
    });
  });

  describe("Multiple wallets", () => {
    it("shows wallet count badge when hasMultipleWallets is true", () => {
      render(
        <WalletMenuButton
          {...defaultProps}
          isConnected={true}
          accountAddress={mockAddress}
          hasMultipleWallets={true}
          connectedWalletCount={2}
        />
      );

      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("does not show wallet count badge when hasMultipleWallets is false", () => {
      render(
        <WalletMenuButton
          {...defaultProps}
          isConnected={true}
          accountAddress={mockAddress}
          hasMultipleWallets={false}
          connectedWalletCount={1}
        />
      );

      expect(screen.queryByText("1")).not.toBeInTheDocument();
    });
  });
});

describe("WalletMenuDropdown", () => {
  const mockOnCopyAddress = vi.fn();
  const mockOnOpenWalletManager = vi.fn();
  const mockOnOpenSettings = vi.fn();
  const mockOnCloseMenu = vi.fn();
  const mockOnDisconnect = vi.fn();

  const baseDropdownProps = {
    isConnected: true,
    isMenuOpen: true,
    hasMultipleWallets: false,
    accountAddress: mockAddress,
    connectedWallets: [{ address: mockAddress, isActive: true }],
    copiedAddress: null as string | null,
    onCopyAddress: mockOnCopyAddress,
    onOpenWalletManager: mockOnOpenWalletManager,
    onOpenSettings: mockOnOpenSettings,
    onCloseMenu: mockOnCloseMenu,
    onDisconnect: mockOnDisconnect,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Visibility conditions", () => {
    it("renders dropdown when isConnected and isMenuOpen are true", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} />);

      expect(
        screen.getByTestId("unified-wallet-menu-dropdown")
      ).toBeInTheDocument();
    });

    it("returns null when isConnected is false", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} isConnected={false} />);

      expect(
        screen.queryByTestId("unified-wallet-menu-dropdown")
      ).not.toBeInTheDocument();
    });

    it("returns null when isMenuOpen is false", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} isMenuOpen={false} />);

      expect(
        screen.queryByTestId("unified-wallet-menu-dropdown")
      ).not.toBeInTheDocument();
    });

    it("has correct role and aria-label", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} />);

      const dropdown = screen.getByTestId("unified-wallet-menu-dropdown");
      expect(dropdown).toHaveAttribute("role", "menu");
      expect(dropdown).toHaveAttribute("aria-label", "Wallet menu");
    });
  });

  describe("Single wallet section", () => {
    it("shows formatted wallet address in single wallet section", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} />);

      // Address appears in dropdown section header
      const instances = screen.getAllByText("0x1234...5678");
      expect(instances.length).toBeGreaterThanOrEqual(1);
    });

    it("shows Copy button for single wallet", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} />);

      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    it("calls onCopyAddress when Copy button is clicked", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} />);

      fireEvent.click(screen.getByText("Copy"));

      expect(mockOnCopyAddress).toHaveBeenCalledWith(mockAddress);
    });

    it("shows Copied text when copiedAddress matches the wallet address", () => {
      render(
        <WalletMenuDropdown
          {...baseDropdownProps}
          copiedAddress={mockAddress}
        />
      );

      expect(screen.getByText("Copied")).toBeInTheDocument();
    });

    it("shows Disconnect button for single wallet", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} />);

      expect(screen.getByText("Disconnect")).toBeInTheDocument();
    });

    it("calls onDisconnect when Disconnect is clicked", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} />);

      fireEvent.click(screen.getByText("Disconnect"));

      expect(mockOnDisconnect).toHaveBeenCalledTimes(1);
    });

    it("shows Settings menu item", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} />);

      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("calls onOpenSettings and onCloseMenu when Settings is clicked", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} />);

      fireEvent.click(screen.getByText("Settings"));

      expect(mockOnOpenSettings).toHaveBeenCalledTimes(1);
      expect(mockOnCloseMenu).toHaveBeenCalledTimes(1);
    });

    it("shows View Bundles when onOpenWalletManager is provided", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} />);

      expect(screen.getByText("View Bundles")).toBeInTheDocument();
    });

    it("calls onOpenWalletManager and onCloseMenu when View Bundles is clicked", () => {
      render(<WalletMenuDropdown {...baseDropdownProps} />);

      fireEvent.click(screen.getByText("View Bundles"));

      expect(mockOnOpenWalletManager).toHaveBeenCalledTimes(1);
      expect(mockOnCloseMenu).toHaveBeenCalledTimes(1);
    });

    it("does not show View Bundles when onOpenWalletManager is undefined", () => {
      render(
        <WalletMenuDropdown
          {...baseDropdownProps}
          onOpenWalletManager={undefined}
        />
      );

      expect(screen.queryByText("View Bundles")).not.toBeInTheDocument();
    });
  });

  describe("Multiple wallets section", () => {
    const multiWalletProps = {
      ...baseDropdownProps,
      hasMultipleWallets: true,
      connectedWallets: [
        { address: mockAddress, isActive: true },
        { address: mockAddress2, isActive: false },
      ],
    };

    it("shows Connected Wallets heading for multiple wallets", () => {
      render(<WalletMenuDropdown {...multiWalletProps} />);

      expect(screen.getByText("Connected Wallets")).toBeInTheDocument();
    });

    it("shows all connected wallet addresses", () => {
      render(<WalletMenuDropdown {...multiWalletProps} />);

      expect(screen.getByText("0x1234...5678")).toBeInTheDocument();
      expect(screen.getByText("0xabcd...ef12")).toBeInTheDocument();
    });

    it("shows Active Wallet label for the active wallet", () => {
      render(<WalletMenuDropdown {...multiWalletProps} />);

      expect(screen.getByText("Active Wallet")).toBeInTheDocument();
    });

    it("shows Disconnect All button instead of Disconnect", () => {
      render(<WalletMenuDropdown {...multiWalletProps} />);

      expect(screen.getByText("Disconnect All")).toBeInTheDocument();
      expect(screen.queryByText("Disconnect")).not.toBeInTheDocument();
    });

    it("renders ConnectWalletButton for adding a new wallet", () => {
      render(<WalletMenuDropdown {...multiWalletProps} />);

      expect(screen.getByTestId("connect-wallet-btn")).toBeInTheDocument();
    });

    it("shows icon-only copy buttons for each wallet (no Copy text)", () => {
      render(<WalletMenuDropdown {...multiWalletProps} />);

      // In icon-only mode the button renders no text label
      expect(screen.queryByText("Copy")).not.toBeInTheDocument();
    });

    it("calls onCopyAddress with the correct address when copy icon is clicked", () => {
      render(
        <WalletMenuDropdown
          {...multiWalletProps}
          copiedAddress={mockAddress2}
        />
      );

      // copiedAddress matches mockAddress2 so its button shows Check icon; the other one fires the click
      // Both buttons are present - find by role and click the first one
      const copyButtons = screen
        .getAllByRole("button")
        .filter(btn => !btn.textContent);

      fireEvent.click(copyButtons[0]);

      expect(mockOnCopyAddress).toHaveBeenCalledWith(mockAddress);
    });

    it("does not render single wallet section for multiple wallets", () => {
      render(<WalletMenuDropdown {...multiWalletProps} />);

      expect(screen.queryByText("Connected Wallet")).not.toBeInTheDocument();
    });
  });
});
