import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WalletManager } from "../../../src/components/WalletManager";
import * as walletService from "../../../src/components/WalletManager/services/WalletService";
import { render } from "../../test-utils";

vi.mock("../../../src/providers/WalletProvider", () => {
  const React = require("react");
  const { createContext, useContext } = React;

  const walletContextValue = {
    account: {
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      isConnected: true,
      balance: "0",
    },
    chain: {
      id: 1,
      name: "Ethereum",
      symbol: "ETH",
    },
    connect: async () => {
      /* Mock implementation */
    },
    disconnect: async () => {
      /* Mock implementation */
    },
    switchChain: async () => {
      /* Mock implementation */
    },
    isConnected: true,
    isConnecting: false,
    isDisconnecting: false,
    error: null,
    clearError: () => {
      /* Mock implementation */
    },
    signMessage: async () => "signed-message",
    isChainSupported: () => true,
    getSupportedChains: () => [
      {
        id: 1,
        name: "Ethereum",
        symbol: "ETH",
      },
    ],
  };

  const WalletContext = createContext(walletContextValue);

  const WalletProviderMock = ({ children }: { children: React.ReactNode }) => (
    <WalletContext.Provider value={walletContextValue}>
      {children}
    </WalletContext.Provider>
  );

  const useWalletProviderMock = () => {
    const context = useContext(WalletContext);
    if (!context) {
      throw new Error("useWalletProvider must be used within a WalletProvider");
    }
    return context;
  };

  return {
    WalletProvider: WalletProviderMock,
    useWalletProvider: useWalletProviderMock,
  };
});

// Mock UserContext
let mockUserContextValue = {
  userInfo: { userId: "user-123" },
  loading: false,
  error: null as string | null,
  isConnected: true,
  connectedWallet: "0x1234567890123456789012345678901234567890",
  refetch: vi.fn(),
};

vi.mock("../../../src/contexts/UserContext", () => ({
  useUser: () => mockUserContextValue,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, animate, exit, initial, layout, ...props }: any) => {
      const cleanProps = { ...props };
      delete cleanProps.animate;
      delete cleanProps.exit;
      delete cleanProps.initial;
      delete cleanProps.layout;
      return <div {...cleanProps}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock react-query client
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

// Mock UI primitives
vi.mock("../../../src/components/ui", () => ({
  BaseCard: ({ children, className }: any) => (
    <div className={`base-card ${className || ""}`}>{children}</div>
  ),
  GradientButton: ({ children, onClick, disabled, className }: any) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

// Mock Loading components
vi.mock("../../../src/components/ui/UnifiedLoading", () => ({
  UnifiedLoading: ({ "aria-label": ariaLabel }: any) => (
    <div data-testid="unified-loading" aria-label={ariaLabel} />
  ),
}));
vi.mock("../../../src/components/ui/LoadingSpinner", () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

// Mock service layer
vi.mock("../../../src/components/WalletManager/services/WalletService", () => {
  const loadWallets = vi.fn();
  const addWallet = vi.fn();
  const removeWallet = vi.fn();
  const updateWalletLabel = vi.fn();
  const updateUserEmailSubscription = vi.fn();
  const unsubscribeUserEmail = vi.fn();

  return {
    loadWallets,
    addWallet,
    removeWallet,
    updateWalletLabel,
    updateUserEmailSubscription,
    unsubscribeUserEmail,
  };
});

describe("WalletManager owner/viewer behavior", () => {
  const mockWalletService = vi.mocked(walletService);

  const mockTransformed = [
    {
      id: "wallet-1",
      address: "0x1234567890123456789012345678901234567890",
      label: "Primary Wallet",
      isMain: true,
      isActive: true,
      createdAt: "2024-01-01T00:00:00Z",
    },
    {
      id: "wallet-2",
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      label: "Trading Wallet",
      isMain: false,
      isActive: false,
      createdAt: "2024-01-02T00:00:00Z",
    },
  ];

  const renderManager = async (props?: { urlUserId?: string }) => {
    let result: any;
    await act(async () => {
      result = render(
        <WalletManager isOpen onClose={vi.fn()} {...(props || {})} />
      );
      await Promise.resolve();
    });
    return result;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserContextValue = {
      userInfo: { userId: "user-123" },
      loading: false,
      error: null,
      isConnected: true,
      connectedWallet: "0x1234567890123456789012345678901234567890",
      refetch: vi.fn(),
    };
    mockWalletService.loadWallets.mockResolvedValue(mockTransformed);
  });

  it("uses urlUserId for fetching when viewing another user's bundle", async () => {
    await renderManager({ urlUserId: "viewer-xyz" });

    await waitFor(() => {
      expect(mockWalletService.loadWallets).toHaveBeenCalledWith("viewer-xyz");
    });
  });

  it("restricts action menus and subscription when not owner", async () => {
    await renderManager({ urlUserId: "viewer-xyz" });

    // Wait for wallets to render
    await screen.findByText("Primary Wallet");

    // Action menus still render for visitors but only expose read-only options
    const menus = screen.getAllByLabelText(/Actions for/);
    expect(menus.length).toBe(mockTransformed.length);

    // Open first menu and verify owner-only actions are hidden
    await userEvent.click(menus[0]!);
    await screen.findByText("Copy Address");
    expect(screen.queryByText("Edit Label")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove from Bundle")).not.toBeInTheDocument();

    // No Add Another Wallet section header
    expect(screen.queryByText("Add Another Wallet")).not.toBeInTheDocument();

    // No PnL subscription section
    expect(screen.queryByText("Weekly PnL Reports")).not.toBeInTheDocument();
  });

  it("does not auto-refresh for viewer (non-owner)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderManager({ urlUserId: "viewer-xyz" });

      await waitFor(() => {
        expect(mockWalletService.loadWallets).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        vi.advanceTimersByTime(30000);
        await Promise.resolve();
      });

      // Still only the initial fetch
      expect(mockWalletService.loadWallets).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
