import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BundlePageClient } from "@/app/bundle/BundlePageClient";

import { render } from "../../../test-utils";

// Lightweight stubs to isolate the banner logic
vi.mock("@/components/Navigation", () => ({
  Navigation: () => null,
}));

vi.mock("@/components/wallet/portfolio/WalletPortfolio", () => ({
  WalletPortfolio: () => <div data-testid="wallet-portfolio" />,
}));

vi.mock("@/components/bundle", () => ({
  QuickSwitchFAB: () => null,
}));

vi.mock("@/components/wallet/portfolio/DashboardShell", () => ({
  DashboardShell: ({
    headerBanners,
    footerOverlays,
  }: {
    headerBanners?: unknown;
    footerOverlays?: unknown;
  }) => (
    <div data-testid="dashboard-shell">
      <div data-testid="dashboard-header-banners">{headerBanners}</div>
      <div data-testid="dashboard-footer-overlays">{footerOverlays}</div>
    </div>
  ),
}));

// Stub WalletManager to expose a control that calls onEmailSubscribed
vi.mock("@/components/WalletManager", () => ({
  WalletManager: ({
    onEmailSubscribed,
  }: {
    onEmailSubscribed?: () => void;
  }) => (
    <button
      type="button"
      data-testid="confirm-email-subscribe"
      onClick={() => onEmailSubscribed && onEmailSubscribed()}
    >
      Confirm Subscribe
    </button>
  ),
}));

// Router mock
vi.mock("@/lib/routing", () => {
  return {
    useAppRouter: () => ({ replace: vi.fn() }),
    useAppPathname: () => "/bundle",
    useAppSearchParams: () => new URLSearchParams(window.location.search),
  };
});

// User context mock (overridden per test)
let mockIsConnected = false;
let mockUserId: string | null = null;
let mockEmail: string | undefined;
let mockConnectedWallet: string | null = null;
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    userInfo: mockUserId ? { userId: mockUserId, email: mockEmail } : null,
    isConnected: mockIsConnected,
    loading: false,
    error: null,
    connectedWallet: mockConnectedWallet,
    refetch: () => {
      /* Mock refetch */
    },
  }),
}));

// Mock localStorage for EmailReminderBanner tests - allow calls but track them
const mockGetItem = vi.fn(() => "false"); // Always return false so switch banner doesn't show
const mockSetItem = vi.fn();

Object.defineProperty(window, "localStorage", {
  value: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
});

describe("EmailReminderBanner behavior (no localStorage persistence)", () => {
  beforeEach(() => {
    mockIsConnected = true;
    mockUserId = "OWNER123"; // viewing own bundle
    mockEmail = undefined; // no email saved → banner eligible
    mockConnectedWallet = "0xOWNER123";
    window.history.pushState({}, "", "/bundle?userId=OWNER123");

    // Clear mock call counts, but allow the component to work normally
    mockGetItem.mockClear();
    mockSetItem.mockClear();
  });

  it("shows banner initially and does not touch localStorage on render", async () => {
    await act(async () => {
      render(<BundlePageClient userId="OWNER123" />);
    });

    expect(screen.getByText(/subscribe to email reports/i)).toBeInTheDocument();
    // Note: BundlePageClient may call localStorage for switch banner functionality
    // but EmailReminderBanner itself doesn't use localStorage for persistence
    expect(mockSetItem).not.toHaveBeenCalled(); // No localStorage writes from EmailReminderBanner
  });

  it("hides when clicking Later, without using localStorage", async () => {
    await act(async () => {
      render(<BundlePageClient userId="OWNER123" />);
    });

    await act(async () => {
      await userEvent.click(screen.getByText(/later/i));
    });

    expect(
      screen.queryByText(/subscribe to email reports/i)
    ).not.toBeInTheDocument();
    expect(mockSetItem).not.toHaveBeenCalled(); // EmailReminderBanner doesn't persist dismissal
  });

  it("does not persist dismissal across remounts", async () => {
    const { unmount } = await act(async () => {
      return render(<BundlePageClient userId="OWNER123" />);
    });

    await act(async () => {
      await userEvent.click(screen.getByText(/later/i));
    });

    expect(
      screen.queryByText(/subscribe to email reports/i)
    ).not.toBeInTheDocument();

    // Remount fresh
    unmount();
    await act(async () => {
      render(<BundlePageClient userId="OWNER123" />);
    });
    expect(screen.getByText(/subscribe to email reports/i)).toBeInTheDocument();
  });

  it("hides after completing subscription via WalletManager (onEmailSubscribed)", async () => {
    await act(async () => {
      render(<BundlePageClient userId="OWNER123" />);
    });

    // Open subscribe flow
    await act(async () => {
      await userEvent.click(screen.getByText(/subscribe now/i));
    });

    // Trigger mocked WalletManager success which calls onEmailSubscribed
    await act(async () => {
      await userEvent.click(screen.getByTestId("confirm-email-subscribe"));
    });

    expect(
      screen.queryByText(/subscribe to email reports/i)
    ).not.toBeInTheDocument();
  });
});
