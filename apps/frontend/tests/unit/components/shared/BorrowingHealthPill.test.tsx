import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BorrowingHealthPill } from "@/components/wallet/portfolio/components/shared/BorrowingHealthPill";
import type { BorrowingSummary } from "@/services/analyticsService";

// Mock the BorrowingPositionsTooltip component since we're not testing its internals here
vi.mock(
  "@/components/wallet/portfolio/components/shared/BorrowingPositionsTooltip",
  () => ({
    BorrowingPositionsTooltip: () => (
      <div data-testid="tooltip-content">Tooltip Content</div>
    ),
  })
);

// Mock useBorrowingPositions hook
vi.mock("@/hooks/queries/analytics/useBorrowingPositions", () => ({
  useBorrowingPositions: () => ({
    data: { positions: [], total_collateral_usd: 0, total_debt_usd: 0 },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe("BorrowingHealthPill", () => {
  const mockSummary: BorrowingSummary = {
    overall_status: "HEALTHY",
    worst_health_rate: 1.85,
    total_positions: 1,
    has_debt: true,
    risk_level: "HEALTHY",
    critical_count: 0,
    warning_count: 0,
    healthy_count: 1,
  };

  const userId = "test-user-id";

  it("renders correctly with initial state", () => {
    render(<BorrowingHealthPill summary={mockSummary} userId={userId} />);

    expect(screen.getByText("Borrowing:")).toBeInTheDocument();
    expect(screen.getByText("1.85")).toBeInTheDocument();
    expect(screen.queryByTestId("tooltip-content")).not.toBeInTheDocument();
  });

  it("toggles tooltip on click", () => {
    render(<BorrowingHealthPill summary={mockSummary} userId={userId} />);

    const pill = screen.getByRole("button");

    // Open
    fireEvent.click(pill);
    expect(screen.getByTestId("tooltip-content")).toBeInTheDocument();
    expect(pill).toHaveAttribute("aria-expanded", "true");

    // Close
    fireEvent.click(pill);
    expect(screen.queryByTestId("tooltip-content")).not.toBeInTheDocument();
    expect(pill).toHaveAttribute("aria-expanded", "false");
  });

  it("closes tooltip when clicking outside", () => {
    render(<BorrowingHealthPill summary={mockSummary} userId={userId} />);

    const pill = screen.getByRole("button");

    // Open first
    fireEvent.click(pill);
    expect(screen.getByTestId("tooltip-content")).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("tooltip-content")).not.toBeInTheDocument();
  });

  it("does not close when clicking inside the tooltip", () => {
    render(<BorrowingHealthPill summary={mockSummary} userId={userId} />);

    const pill = screen.getByRole("button");

    // Open first
    fireEvent.click(pill);
    const tooltip = screen.getByTestId("tooltip-content");

    // Click inside tooltip
    fireEvent.mouseDown(tooltip);
    expect(tooltip).toBeInTheDocument();
  });

  it("does not render if overall_status is null", () => {
    const nullSummary = { ...mockSummary, overall_status: null as any };
    const { container } = render(
      <BorrowingHealthPill summary={nullSummary} userId={userId} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
