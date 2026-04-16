import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BundlePageClient } from "@/app/bundle/BundlePageClient";

import { render } from "../../../test-utils";

// Mock lightweight child components to avoid heavy hooks
vi.mock("@/components/Navigation", () => ({
  Navigation: () => null,
}));

vi.mock("@/components/wallet/portfolio/WalletPortfolio", () => ({
  WalletPortfolio: () => <div data-testid="wallet-portfolio" />,
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

vi.mock("@/components/WalletManager", () => ({
  WalletManager: () => null,
}));

// Router mock
const replaceMock = vi.fn();
vi.mock("@/lib/routing", () => {
  return {
    useAppRouter: () => ({ replace: replaceMock }),
    useAppPathname: () => "/bundle",
    useAppSearchParams: () => new URLSearchParams(window.location.search),
  };
});

// User context mock (we'll override return values per test)
let mockIsConnected = false;
let mockUserId: string | null = null;
let mockConnectedWallet: string | null = null;
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    userInfo: mockUserId ? { userId: mockUserId } : null,
    isConnected: mockIsConnected,
    loading: false,
    error: null,
    connectedWallet: mockConnectedWallet,
    refetch: () => {
      /* Mock refetch */
    },
  }),
}));

describe("BundlePageClient switch prompt", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    mockIsConnected = false;
    mockUserId = null;
    mockConnectedWallet = null;
    // Default URL
    window.history.pushState({}, "", "/bundle?userId=OWNER123&foo=bar");
  });

  it("allows staying on the current bundle (banner persists)", async () => {
    mockIsConnected = true;
    mockUserId = "ME456"; // different user
    mockConnectedWallet = "0xME456";

    await act(async () => {
      render(<BundlePageClient userId="OWNER123" />);
    });

    const switchBtn = await screen.findByTestId("switch-button");
    expect(switchBtn).toBeInTheDocument();
    expect(switchBtn).toHaveTextContent("Switch to mine");

    // Banner should be visible
    expect(screen.getByTestId("switch-prompt-banner")).toBeInTheDocument();

    // Verify no "Stay" button exists (simplified UX)
    expect(screen.queryByText(/stay/i)).not.toBeInTheDocument();

    // Ensure we haven't navigated away just by rendering
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does not show prompt when viewing own bundle", async () => {
    mockIsConnected = true;
    mockUserId = "OWNER123"; // same as URL
    mockConnectedWallet = "0xOWNER123";

    await act(async () => {
      render(<BundlePageClient userId="OWNER123" />);
    });

    expect(screen.queryByTestId("switch-button")).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
