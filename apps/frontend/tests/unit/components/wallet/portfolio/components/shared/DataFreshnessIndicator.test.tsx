import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataFreshnessIndicator } from "@/components/wallet/portfolio/components/shared/DataFreshnessIndicator";

describe("DataFreshnessIndicator", () => {
  it("shows 'fresh' state for recent data", () => {
    const recentTime = new Date(Date.now() - 1000 * 60).toISOString(); // 1 min ago
    render(<DataFreshnessIndicator lastUpdated={recentTime} />);

    expect(screen.getByText(/a minute ago/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("shows 'stale' state for old data", () => {
    const oldTime = new Date(Date.now() - 1000 * 60 * 10).toISOString(); // 10 min ago
    render(<DataFreshnessIndicator lastUpdated={oldTime} />);

    expect(screen.getByText(/10 minutes ago/i)).toBeInTheDocument();
  });

  it("shows 'very-stale' state for very old data", () => {
    const veryOldTime = new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(); // 2 hours ago
    render(<DataFreshnessIndicator lastUpdated={veryOldTime} />);

    expect(screen.getByText(/2 hours ago/i)).toBeInTheDocument();
  });

  it("shows 'unknown' state when lastUpdated is null", () => {
    render(<DataFreshnessIndicator lastUpdated={null} />);

    expect(screen.getByText(/Unknown/i)).toBeInTheDocument();
  });

  it("renders icon-only variant", () => {
    const recentTime = new Date(Date.now() - 1000 * 60).toISOString();
    const { container } = render(
      <DataFreshnessIndicator lastUpdated={recentTime} variant="icon-only" />
    );

    // Icon should be present, text should be hidden
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders responsive variant with correct classes", () => {
    const recentTime = new Date(Date.now() - 1000 * 60).toISOString();
    const { container } = render(
      <DataFreshnessIndicator lastUpdated={recentTime} variant="responsive" />
    );

    // Check for responsive classes - component uses md: breakpoint, not sm:
    expect(container.querySelector(".hidden.md\\:inline")).toBeInTheDocument();
  });

  it("handles undefined lastUpdated", () => {
    render(<DataFreshnessIndicator lastUpdated={undefined} />);

    expect(screen.getByText(/Unknown/i)).toBeInTheDocument();
  });
});
