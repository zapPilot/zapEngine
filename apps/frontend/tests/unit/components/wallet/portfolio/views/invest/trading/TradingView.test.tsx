import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TradingView } from "@/components/wallet/portfolio/views/invest/trading/TradingView";

// Mock child panels to avoid deep dependency chains
vi.mock(
  "@/components/wallet/portfolio/views/invest/trading/components/RebalancePanel",
  () => ({
    RebalancePanel: ({ userId }: { userId: string }) => (
      <div data-testid="rebalance-panel">{userId}</div>
    ),
  })
);

vi.mock(
  "@/components/wallet/portfolio/views/invest/trading/components/TransactionPanel",
  () => ({
    TransactionPanel: ({ mode }: { mode: string }) => (
      <div data-testid="transaction-panel">{mode}</div>
    ),
  })
);

// Mock EmptyStateCard
vi.mock("@/components/ui/EmptyStateCard", () => ({
  EmptyStateCard: ({ message }: { message: string }) => (
    <div data-testid="empty-state">{message}</div>
  ),
}));

describe("TradingView", () => {
  it("shows empty state when userId is undefined", () => {
    render(<TradingView userId={undefined} />);

    expect(screen.getByTestId("empty-state")).toBeDefined();
    expect(screen.getByText("Connect wallet to access trading")).toBeDefined();
  });

  it("renders rebalance panel by default when userId is provided", () => {
    render(<TradingView userId="0xabc" />);

    expect(screen.getByTestId("rebalance-panel")).toBeDefined();
    expect(screen.getByText("0xabc")).toBeDefined();
  });

  it("renders all three mode buttons", () => {
    render(<TradingView userId="0xabc" />);

    expect(screen.getByText("rebalance")).toBeDefined();
    expect(screen.getByText("deposit")).toBeDefined();
    expect(screen.getByText("withdraw")).toBeDefined();
  });

  it("switches to deposit mode", () => {
    render(<TradingView userId="0xabc" />);

    fireEvent.click(screen.getByText("deposit"));

    expect(screen.getByTestId("transaction-panel")).toBeDefined();
    // "deposit" text appears in both the panel and the button, use panel content
    expect(screen.getByTestId("transaction-panel").textContent).toBe("deposit");
    expect(screen.queryByTestId("rebalance-panel")).toBeNull();
  });

  it("switches to withdraw mode", () => {
    render(<TradingView userId="0xabc" />);

    fireEvent.click(screen.getByText("withdraw"));

    const panel = screen.getByTestId("transaction-panel");
    expect(panel.textContent).toBe("withdraw");
  });

  it("switches back to rebalance mode", () => {
    render(<TradingView userId="0xabc" />);

    fireEvent.click(screen.getByText("deposit"));
    fireEvent.click(screen.getByText("rebalance"));

    expect(screen.getByTestId("rebalance-panel")).toBeDefined();
    expect(screen.queryByTestId("transaction-panel")).toBeNull();
  });

  it("applies active style to the selected mode button", () => {
    render(<TradingView userId="0xabc" />);

    const rebalanceBtn = screen.getByText("rebalance");
    expect(rebalanceBtn.className).toContain("bg-gray-900");

    const depositBtn = screen.getByText("deposit");
    expect(depositBtn.className).toContain("text-gray-500");
  });
});
