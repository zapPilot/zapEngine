import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WalletFilterSelector } from "@/components/wallet/portfolio/analytics/components/WalletFilterSelector";
import type { WalletOption } from "@/types/analytics";

// Mock Lucide icons
vi.mock("lucide-react", () => ({
  Wallet: () => <div data-testid="icon-wallet" />,
  ChevronDown: ({ className }: { className?: string }) => (
    <div data-testid="icon-chevron" className={className} />
  ),
  Check: () => <div data-testid="icon-check" />,
}));

// Mock formatAddress utility
vi.mock("@/utils/formatters", () => ({
  formatAddress: (address: string) => {
    // Simple mock: show first 6 and last 4 characters
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  },
}));

const mockWallets: WalletOption[] = [
  {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    label: "Main Wallet",
  },
  {
    address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    label: "Trading Wallet",
  },
  {
    address: "0x9876543210fedcba9876543210fedcba98765432",
    label: null, // Wallet without label
  },
];

describe("WalletFilterSelector", () => {
  it("renders with 'All Wallets' selected by default", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet={null}
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    expect(screen.getByText("All Wallets")).toBeInTheDocument();
    expect(screen.getByTestId("icon-wallet")).toBeInTheDocument();
    expect(screen.getByTestId("icon-chevron")).toBeInTheDocument();
  });

  it("shows selected wallet label when wallet is selected", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet="0x1234567890abcdef1234567890abcdef12345678"
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    expect(screen.getByText("Main Wallet")).toBeInTheDocument();
  });

  it("shows formatted address when selected wallet has no label", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet="0x9876543210fedcba9876543210fedcba98765432"
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    expect(screen.getByText("0x9876...5432")).toBeInTheDocument();
  });

  it("opens dropdown when button is clicked", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet={null}
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Dropdown should be visible with "All Wallets" option
    expect(screen.getAllByText("All Wallets")).toHaveLength(2); // Button + dropdown option
  });

  it("renders all wallet options in dropdown", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet={null}
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    // Open dropdown
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Check for wallet labels
    expect(screen.getByText("Main Wallet")).toBeInTheDocument();
    expect(screen.getByText("Trading Wallet")).toBeInTheDocument();

    // Check for formatted addresses
    expect(screen.getByText("0x1234...5678")).toBeInTheDocument();
    expect(screen.getByText("0xabcd...abcd")).toBeInTheDocument();
    expect(screen.getByText("0x9876...5432")).toBeInTheDocument();
  });

  it("shows checkmark on selected option", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet={null}
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    // Open dropdown
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Should have exactly 1 checkmark (for "All Wallets")
    expect(screen.getAllByTestId("icon-check")).toHaveLength(1);
  });

  it("calls onChange with null when 'All Wallets' is selected", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet="0x1234567890abcdef1234567890abcdef12345678"
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    // Open dropdown
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Find the "All Wallets" option in the listbox (not the button text, which shows selected wallet)
    const listbox = screen.getByRole("listbox");
    const allWalletsOption = listbox.querySelector("button");

    expect(allWalletsOption).toBeDefined();
    if (allWalletsOption) {
      fireEvent.click(allWalletsOption);
    }

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("calls onChange with wallet address when wallet is selected", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet={null}
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    // Open dropdown
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Click "Main Wallet" option
    const mainWalletButton = screen.getByText("Main Wallet").closest("button");
    if (mainWalletButton) {
      fireEvent.click(mainWalletButton);
    }

    expect(onChange).toHaveBeenCalledWith(
      "0x1234567890abcdef1234567890abcdef12345678"
    );
  });

  it("closes dropdown after selection", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet={null}
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    // Open dropdown
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Verify dropdown is open
    expect(screen.getAllByText("All Wallets")).toHaveLength(2);

    // Click a wallet option
    const mainWalletButton = screen.getByText("Main Wallet").closest("button");
    if (mainWalletButton) {
      fireEvent.click(mainWalletButton);
    }

    // Dropdown should be closed (only button text remains)
    expect(screen.queryByText("Trading Wallet")).not.toBeInTheDocument();
  });

  it("closes dropdown when Escape key is pressed", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet={null}
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    // Open dropdown
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Verify dropdown is open
    expect(screen.getAllByText("All Wallets")).toHaveLength(2);

    // Press Escape key
    fireEvent.keyDown(document, { key: "Escape" });

    // Dropdown should be closed
    expect(screen.queryByText("Trading Wallet")).not.toBeInTheDocument();
  });

  it("is disabled when isLoading is true", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet={null}
        availableWallets={mockWallets}
        onChange={onChange}
        isLoading={true}
      />
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("has proper ARIA attributes for accessibility", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet={null}
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "Filter by wallet");
    expect(button).toHaveAttribute("aria-haspopup", "listbox");
    expect(button).toHaveAttribute("aria-expanded", "false");

    // Open dropdown
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("rotates chevron icon when dropdown is open", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet={null}
        availableWallets={mockWallets}
        onChange={onChange}
      />
    );

    const chevron = screen.getByTestId("icon-chevron");

    // Initially should not have rotate-180
    expect(chevron.className).not.toContain("rotate-180");

    // Open dropdown
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Should have rotate-180 when open
    expect(chevron.className).toContain("rotate-180");
  });

  it("handles empty wallet list gracefully", () => {
    const onChange = vi.fn();
    render(
      <WalletFilterSelector
        selectedWallet={null}
        availableWallets={[]}
        onChange={onChange}
      />
    );

    // Open dropdown
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Should only show "All Wallets" option
    expect(screen.getAllByText("All Wallets")).toHaveLength(2);
  });
});
