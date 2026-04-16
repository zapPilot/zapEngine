/**
 * Unit tests for AnalyticsHeader
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AnalyticsHeader } from "@/components/wallet/portfolio/analytics/components/AnalyticsHeader";

// Mock WalletFilterSelector
vi.mock(
  "@/components/wallet/portfolio/analytics/components/WalletFilterSelector",
  () => ({
    WalletFilterSelector: ({ selectedWallet }: any) => (
      <div data-testid="wallet-selector">{selectedWallet || "All Wallets"}</div>
    ),
  })
);

describe("AnalyticsHeader", () => {
  const defaultProps = {
    onExport: vi.fn(),
    isExporting: false,
    exportError: null,
    selectedWallet: null,
    availableWallets: [],
    onWalletChange: vi.fn(),
    showWalletSelector: false,
  };

  it("renders title and export button", () => {
    render(<AnalyticsHeader {...defaultProps} />);
    expect(screen.getByText("Flight Recorder")).toBeInTheDocument();
    expect(screen.getByText("Export Report")).toBeInTheDocument();
  });

  it("handles export click", async () => {
    render(<AnalyticsHeader {...defaultProps} />);
    await userEvent.click(screen.getByText("Export Report"));
    expect(defaultProps.onExport).toHaveBeenCalled();
  });

  it("shows loading state when exporting", () => {
    render(<AnalyticsHeader {...defaultProps} isExporting={true} />);
    expect(screen.getByText("Exporting...")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("displays export error when present", () => {
    render(<AnalyticsHeader {...defaultProps} exportError="Download failed" />);
    expect(screen.getByText("Download failed")).toBeInTheDocument();
  });

  it("shows wallet selector when showWalletSelector is true", () => {
    render(<AnalyticsHeader {...defaultProps} showWalletSelector={true} />);
    expect(screen.getByTestId("wallet-selector")).toBeInTheDocument();
  });

  it("hides wallet selector when showWalletSelector is false", () => {
    render(<AnalyticsHeader {...defaultProps} showWalletSelector={false} />);
    expect(screen.queryByTestId("wallet-selector")).not.toBeInTheDocument();
  });
});
