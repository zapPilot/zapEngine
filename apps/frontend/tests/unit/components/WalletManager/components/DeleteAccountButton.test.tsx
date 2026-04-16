import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DeleteAccountButton } from "@/components/WalletManager/components/DeleteAccountButton";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Trash2: () => <div data-testid="trash-icon">Trash Icon</div>,
  AlertTriangle: () => <div data-testid="alert-triangle-icon">Alert Icon</div>,
}));

// Mock GradientButton
vi.mock("@/components/ui", () => ({
  GradientButton: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-testid="gradient-button"
    >
      {children}
    </button>
  ),
}));

// Mock design system constants
vi.mock("@/constants/design-system", () => ({
  GRADIENTS: {
    DANGER: "danger-gradient",
  },
}));

describe("DeleteAccountButton", () => {
  const defaultProps = {
    onDelete: vi.fn(),
    isDeleting: false,
  };

  describe("initial state", () => {
    it("should render delete account button initially", () => {
      render(<DeleteAccountButton {...defaultProps} />);

      expect(screen.getByText("Delete Account")).toBeInTheDocument();
    });

    it("should display Trash2 icon in initial state", () => {
      render(<DeleteAccountButton {...defaultProps} />);

      expect(screen.getByTestId("trash-icon")).toBeInTheDocument();
    });

    it("should display description text", () => {
      render(<DeleteAccountButton {...defaultProps} />);

      expect(
        screen.getByText(/permanently delete this account/i)
      ).toBeInTheDocument();
    });

    it("should show use case explanation", () => {
      render(<DeleteAccountButton {...defaultProps} />);

      expect(
        screen.getByText(/use this if you accidentally created multiple/i)
      ).toBeInTheDocument();
    });

    it("should not show confirmation dialog initially", () => {
      render(<DeleteAccountButton {...defaultProps} />);

      expect(
        screen.queryByText(/confirm account deletion/i)
      ).not.toBeInTheDocument();
    });

    it("should not show AlertTriangle icon initially", () => {
      render(<DeleteAccountButton {...defaultProps} />);

      expect(
        screen.queryByTestId("alert-triangle-icon")
      ).not.toBeInTheDocument();
    });

    it("should have correct styling classes", () => {
      const { container } = render(<DeleteAccountButton {...defaultProps} />);

      const button = container.querySelector("button");
      expect(button).toHaveClass("w-full");
      expect(button).toHaveClass("text-left");
      expect(button).toHaveClass("border-red-600/30");
      expect(button).toHaveClass("rounded-xl");
    });
  });

  describe("showing confirmation dialog", () => {
    it("should show confirmation dialog when button clicked", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      expect(screen.getByText(/confirm account deletion/i)).toBeInTheDocument();
    });

    it("should hide initial button after showing confirmation", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      expect(
        screen.queryByText(/use this if you accidentally/i)
      ).not.toBeInTheDocument();
    });

    it("should display AlertTriangle icon in confirmation", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      expect(screen.getByTestId("alert-triangle-icon")).toBeInTheDocument();
    });

    it("should display warning message", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      expect(
        screen.getByText(/this will permanently delete this account/i)
      ).toBeInTheDocument();
    });

    it("should show subscription restriction notice", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      expect(
        screen.getByText(
          /you cannot delete accounts with active subscriptions/i
        )
      ).toBeInTheDocument();
    });

    it("should display delete confirmation button", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      expect(screen.getByText(/yes, delete account/i)).toBeInTheDocument();
    });

    it("should display cancel button", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      expect(screen.getByText(/cancel/i)).toBeInTheDocument();
    });
  });

  describe("canceling deletion", () => {
    it("should hide confirmation when cancel clicked", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));
      expect(screen.getByText(/confirm account deletion/i)).toBeInTheDocument();

      await user.click(screen.getByText(/cancel/i));

      expect(
        screen.queryByText(/confirm account deletion/i)
      ).not.toBeInTheDocument();
    });

    it("should show initial button again after cancel", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));
      await user.click(screen.getByText(/cancel/i));

      expect(screen.getByText("Delete Account")).toBeInTheDocument();
    });

    it("should not call onDelete when cancel clicked", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<DeleteAccountButton {...defaultProps} onDelete={onDelete} />);

      await user.click(screen.getByText("Delete Account"));
      await user.click(screen.getByText(/cancel/i));

      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  describe("delete action", () => {
    it("should call onDelete when confirmation button clicked", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<DeleteAccountButton {...defaultProps} onDelete={onDelete} />);

      await user.click(screen.getByText("Delete Account"));
      await user.click(screen.getByText(/yes, delete account/i));

      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it("should not call onDelete when initial button clicked", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<DeleteAccountButton {...defaultProps} onDelete={onDelete} />);

      await user.click(screen.getByText("Delete Account"));

      expect(onDelete).not.toHaveBeenCalled();
    });

    it("should handle multiple confirmation clicks", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<DeleteAccountButton {...defaultProps} onDelete={onDelete} />);

      await user.click(screen.getByText("Delete Account"));
      await user.click(screen.getByText(/yes, delete account/i));
      await user.click(screen.getByText(/yes, delete account/i));

      expect(onDelete.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("loading state", () => {
    it("should show deleting text when isDeleting is true", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      render(<DeleteAccountButton {...defaultProps} isDeleting={true} />);

      await user.click(screen.getByText("Delete Account"));

      expect(screen.getByText(/deleting.../i)).toBeInTheDocument();
    });

    it("should disable delete button when isDeleting is true", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} isDeleting={true} />);

      await user.click(screen.getByText("Delete Account"));

      const deleteButton = screen.getByTestId("gradient-button");
      expect(deleteButton).toBeDisabled();
    });

    it("should disable cancel button when isDeleting is true", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} isDeleting={true} />);

      await user.click(screen.getByText("Delete Account"));

      const cancelButton = screen.getByText(/cancel/i);
      expect(cancelButton).toBeDisabled();
    });

    it("should show normal text when isDeleting is false", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} isDeleting={false} />);

      await user.click(screen.getByText("Delete Account"));

      expect(screen.getByText(/yes, delete account/i)).toBeInTheDocument();
      expect(screen.queryByText(/deleting.../i)).not.toBeInTheDocument();
    });

    it("should enable buttons when isDeleting is false", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} isDeleting={false} />);

      await user.click(screen.getByText("Delete Account"));

      const deleteButton = screen.getByTestId("gradient-button");
      const cancelButton = screen.getByText(/cancel/i);

      expect(deleteButton).not.toBeDisabled();
      expect(cancelButton).not.toBeDisabled();
    });
  });

  describe("state transitions", () => {
    it("should transition from initial to confirmation state", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      // Initial state
      expect(screen.getByText("Delete Account")).toBeInTheDocument();
      expect(
        screen.queryByText(/confirm account deletion/i)
      ).not.toBeInTheDocument();

      // Click to show confirmation
      await user.click(screen.getByText("Delete Account"));

      // Confirmation state
      expect(screen.queryByText("Delete Account")).not.toBeInTheDocument();
      expect(screen.getByText(/confirm account deletion/i)).toBeInTheDocument();
    });

    it("should maintain state across prop changes", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      // Change props
      rerender(<DeleteAccountButton {...defaultProps} isDeleting={true} />);

      // Should still show confirmation
      expect(screen.getByText(/confirm account deletion/i)).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have clickable button in initial state", () => {
      render(<DeleteAccountButton {...defaultProps} />);

      const button = screen.getByText("Delete Account").closest("button");
      expect(button).toBeInTheDocument();
    });

    it("should have semantic button elements", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });

    it("should convey danger through text and icons", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      expect(screen.getByTestId("alert-triangle-icon")).toBeInTheDocument();
      expect(screen.getByText(/permanently delete/i)).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("should handle rapid state toggles", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} />);

      // Open and close rapidly
      await user.click(screen.getByText("Delete Account"));
      await user.click(screen.getByText(/cancel/i));
      await user.click(screen.getByText("Delete Account"));

      expect(screen.getByText(/confirm account deletion/i)).toBeInTheDocument();
    });

    it("should handle clicking delete multiple times", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<DeleteAccountButton {...defaultProps} onDelete={onDelete} />);

      await user.click(screen.getByText("Delete Account"));

      const confirmButton = screen.getByText(/yes, delete account/i);
      await user.click(confirmButton);
      await user.click(confirmButton);

      expect(onDelete.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it("should maintain confirmation state when isDeleting changes", async () => {
      const user = userEvent.setup();
      const { rerender } = render(<DeleteAccountButton {...defaultProps} />);

      await user.click(screen.getByText("Delete Account"));

      rerender(<DeleteAccountButton {...defaultProps} isDeleting={true} />);

      expect(screen.getByText(/confirm account deletion/i)).toBeInTheDocument();
    });

    it("should render correctly without onDelete prop errors", async () => {
      const user = userEvent.setup();
      render(<DeleteAccountButton {...defaultProps} onDelete={vi.fn()} />);

      await user.click(screen.getByText("Delete Account"));

      expect(screen.getByText(/yes, delete account/i)).toBeInTheDocument();
    });
  });
});
