import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WalletPortfolioErrorState } from "@/components/wallet/portfolio/views/LoadingStates";

describe("WalletPortfolioErrorState", () => {
  it("should render error message", () => {
    const error = new Error("Test error message");
    render(<WalletPortfolioErrorState error={error} />);

    expect(
      screen.getByText("Failed to load portfolio data")
    ).toBeInTheDocument();
    expect(screen.getByText("Test error message")).toBeInTheDocument();
  });

  it("should rendering retry button when onRetry is provided", () => {
    const error = new Error("Error");
    const onRetry = vi.fn();
    render(<WalletPortfolioErrorState error={error} onRetry={onRetry} />);

    const button = screen.getByRole("button", { name: /retry/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalled();
  });

  it("should not render retry button when onRetry is undefined", () => {
    const error = new Error("Error");
    render(<WalletPortfolioErrorState error={error} />);

    expect(
      screen.queryByRole("button", { name: /retry/i })
    ).not.toBeInTheDocument();
  });
});
