import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BacktestLoadingState } from "@/components/wallet/portfolio/views/backtesting/components/BacktestLoadingState";

// Mock framer-motion (MetricsSkeleton uses motion.div)
vi.mock("framer-motion", () => ({
  motion: {
    div: vi.fn(
      ({
        children,
        initial,
        animate,
        exit,
        transition,
        ...props
      }: {
        children: React.ReactNode;
        initial?: any;
        animate?: any;
        exit?: any;
        transition?: any;
        [key: string]: any;
      }) => <div {...props}>{children}</div>
    ),
  },
}));

describe("BacktestLoadingState", () => {
  it("renders with accessible status role", () => {
    render(<BacktestLoadingState />);

    const status = screen.getByRole("status", {
      name: /Running backtest simulation/i,
    });
    expect(status).toBeInTheDocument();
  });

  it("renders MetricsSkeleton", () => {
    render(<BacktestLoadingState />);

    expect(screen.getByTestId("metrics-skeleton")).toBeInTheDocument();
  });

  it("renders chart skeleton with heading", () => {
    render(<BacktestLoadingState />);

    expect(screen.getByText("Performance Chart")).toBeInTheDocument();

    // Pulse div for chart placeholder
    const heading = screen.getByText("Performance Chart");
    const pulseDiv = heading.nextElementSibling;
    expect(pulseDiv).toHaveClass("animate-pulse");
  });

  it("renders screen-reader loading text", () => {
    render(<BacktestLoadingState />);

    const srText = screen.getByText("Loading backtest results...");
    expect(srText).toHaveClass("sr-only");
  });

  it("does not render spinner or status text (regression)", () => {
    render(<BacktestLoadingState />);

    // RefreshCw spinner was removed — no spinning icon should exist
    expect(
      screen.queryByText("Running Backtest Simulation")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Analyzing strategies")).not.toBeInTheDocument();
  });
});
