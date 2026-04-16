/**
 * Unit tests for AnalyticsErrorState
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AnalyticsErrorState } from "@/components/wallet/portfolio/analytics/components/AnalyticsErrorState";

describe("AnalyticsErrorState", () => {
  it("renders error message", () => {
    render(
      <AnalyticsErrorState
        error={new Error("Something went wrong")}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByText("Failed to Load Analytics Data")
    ).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders default message if error is null", () => {
    render(<AnalyticsErrorState error={null} onRetry={vi.fn()} />);
    expect(
      screen.getByText("Unable to fetch analytics data. Please try again.")
    ).toBeInTheDocument();
  });

  it("calls onRetry when button clicked", async () => {
    const onRetry = vi.fn();
    render(<AnalyticsErrorState error={null} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
