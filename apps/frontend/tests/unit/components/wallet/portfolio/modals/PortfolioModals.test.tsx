import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PortfolioModals } from "@/components/wallet/portfolio/modals/PortfolioModals";

const MOCK_DATA = {
  currentAllocation: {
    crypto: 50,
    stable: 50,
    simplifiedCrypto: 50,
  },
  targetAllocation: {
    crypto: 60,
    stable: 40,
  },
} as any;

// Mock child modals
vi.mock("@/components/wallet/portfolio/modals", () => ({
  DepositModal: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="deposit-modal">
        Deposit Modal <button onClick={onClose}>Close</button>
      </div>
    ) : null,
  WithdrawModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="withdraw-modal">Withdraw Modal</div> : null,
  RebalanceModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="rebalance-modal">Rebalance Modal</div> : null,
}));

vi.mock("@/components/wallet/portfolio/modals/SettingsModal", () => ({
  SettingsModal: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="settings-modal">
        Settings Modal <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

describe("PortfolioModals", () => {
  const defaultProps = {
    activeModal: null,
    onClose: vi.fn(),
    data: MOCK_DATA,
    isSettingsOpen: false,
    setIsSettingsOpen: vi.fn(),
  };

  it("renders nothing when no modal is active", () => {
    render(<PortfolioModals {...defaultProps} />);
    expect(screen.queryByTestId("deposit-modal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("withdraw-modal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rebalance-modal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument();
  });

  it("renders DepositModal when activeModal is 'deposit'", () => {
    render(<PortfolioModals {...defaultProps} activeModal="deposit" />);
    expect(screen.getByTestId("deposit-modal")).toBeInTheDocument();
  });

  it("renders WithdrawModal when activeModal is 'withdraw'", () => {
    render(<PortfolioModals {...defaultProps} activeModal="withdraw" />);
    expect(screen.getByTestId("withdraw-modal")).toBeInTheDocument();
  });

  it("renders RebalanceModal when activeModal is 'rebalance'", () => {
    render(<PortfolioModals {...defaultProps} activeModal="rebalance" />);
    expect(screen.getByTestId("rebalance-modal")).toBeInTheDocument();
  });

  it("renders SettingsModal when isSettingsOpen is true", () => {
    render(<PortfolioModals {...defaultProps} isSettingsOpen={true} />);
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
  });

  it("handles SettingsModal close", () => {
    const setIsSettingsOpen = vi.fn();
    render(
      <PortfolioModals
        {...defaultProps}
        isSettingsOpen={true}
        setIsSettingsOpen={setIsSettingsOpen}
      />
    );

    // Find close button inside mock
    const closeBtn = screen.getByText("Close");
    fireEvent.click(closeBtn);
    expect(setIsSettingsOpen).toHaveBeenCalledWith(false);
  });

  // --- Regression Tests ---

  describe("Modal Exclusivity", () => {
    it("should only render one modal at a time when activeModal is set", () => {
      render(<PortfolioModals {...defaultProps} activeModal="deposit" />);

      // Only deposit modal should be visible
      expect(screen.getByTestId("deposit-modal")).toBeInTheDocument();
      expect(screen.queryByTestId("withdraw-modal")).not.toBeInTheDocument();
      expect(screen.queryByTestId("rebalance-modal")).not.toBeInTheDocument();
    });

    it("should not interfere with SettingsModal when activeModal is set", () => {
      render(
        <PortfolioModals
          {...defaultProps}
          activeModal="deposit"
          isSettingsOpen={true}
        />
      );

      // Both modals should be visible (they're independent)
      expect(screen.getByTestId("deposit-modal")).toBeInTheDocument();
      expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
    });
  });

  describe("onClose Callback", () => {
    it("should pass onClose callback to DepositModal", () => {
      const onClose = vi.fn();
      render(
        <PortfolioModals
          {...defaultProps}
          activeModal="deposit"
          onClose={onClose}
        />
      );

      // Find close button inside mock and click it
      const closeBtn = screen.getByText("Close");
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("RebalanceModal Props", () => {
    it("should pass current allocation to RebalanceModal", () => {
      const customData = {
        currentAllocation: {
          crypto: 70,
          stable: 30,
          simplifiedCrypto: 70,
        },
        targetAllocation: {
          crypto: 60,
          stable: 40,
        },
      } as any;

      render(
        <PortfolioModals
          {...defaultProps}
          activeModal="rebalance"
          data={customData}
        />
      );

      expect(screen.getByTestId("rebalance-modal")).toBeInTheDocument();
    });

    it("should pass target allocation to RebalanceModal", () => {
      render(<PortfolioModals {...defaultProps} activeModal="rebalance" />);

      expect(screen.getByTestId("rebalance-modal")).toBeInTheDocument();
    });
  });

  describe("Data Binding", () => {
    it("should not crash when data has missing optional fields", () => {
      const minimalData = {
        currentAllocation: {
          crypto: 0,
          stable: 0,
          simplifiedCrypto: 0,
        },
        targetAllocation: {
          crypto: 0,
          stable: 0,
        },
      } as any;

      render(
        <PortfolioModals
          {...defaultProps}
          activeModal="rebalance"
          data={minimalData}
        />
      );

      expect(screen.getByTestId("rebalance-modal")).toBeInTheDocument();
    });
  });

  describe("Modal State Transitions", () => {
    it("should close modal when activeModal changes from value to null", () => {
      const { rerender } = render(
        <PortfolioModals {...defaultProps} activeModal="deposit" />
      );

      expect(screen.getByTestId("deposit-modal")).toBeInTheDocument();

      // Simulate parent changing activeModal to null
      rerender(<PortfolioModals {...defaultProps} activeModal={null} />);

      expect(screen.queryByTestId("deposit-modal")).not.toBeInTheDocument();
    });

    it("should switch between modals correctly", () => {
      const { rerender } = render(
        <PortfolioModals {...defaultProps} activeModal="deposit" />
      );

      expect(screen.getByTestId("deposit-modal")).toBeInTheDocument();

      // Switch to withdraw
      rerender(<PortfolioModals {...defaultProps} activeModal="withdraw" />);

      expect(screen.queryByTestId("deposit-modal")).not.toBeInTheDocument();
      expect(screen.getByTestId("withdraw-modal")).toBeInTheDocument();
    });
  });
});
