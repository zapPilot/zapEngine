import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SubmittingState,
  TransactionActionButton,
  TransactionFormActionsWithForm,
  TransactionModalHeader,
} from "@/components/wallet/portfolio/modals/components/TransactionModalParts";

// Mock GradientButton
vi.mock("@/components/ui/GradientButton", () => ({
  GradientButton: ({ children, onClick, disabled, className }: any) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

// Mock IntentVisualizer using absolute path to be safe
vi.mock(
  "@/components/wallet/portfolio/modals/visualizers/IntentVisualizer",
  () => ({
    IntentVisualizer: () => (
      <div data-testid="intent-visualizer">Visualizer</div>
    ),
  })
);

describe("TransactionModalParts", () => {
  describe("TransactionModalHeader", () => {
    it("renders title and close button", () => {
      const onClose = vi.fn();
      render(
        <TransactionModalHeader
          title="Test Title"
          indicatorClassName="bg-red-500"
          isSubmitting={false}
          onClose={onClose}
        />
      );

      expect(screen.getByText("Test Title")).toBeInTheDocument();
      const closeBtn = screen.getByLabelText("Close");
      expect(closeBtn).toBeInTheDocument();
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it("hides close button when submitting", () => {
      render(
        <TransactionModalHeader
          title="Test"
          indicatorClassName="bg-red"
          isSubmitting={true}
          onClose={vi.fn()}
        />
      );
      expect(screen.queryByLabelText("Close")).not.toBeInTheDocument();
    });

    it("applies indicatorClassName to the indicator dot", () => {
      const { container } = render(
        <TransactionModalHeader
          title="Dot Test"
          indicatorClassName="bg-green-400"
          isSubmitting={false}
          onClose={vi.fn()}
        />
      );
      const dot = container.querySelector(".bg-green-400");
      expect(dot).toBeInTheDocument();
    });

    it("calls onClose only when close button is clicked (not submitting)", () => {
      const onClose = vi.fn();
      render(
        <TransactionModalHeader
          title="Click Test"
          indicatorClassName="bg-blue-500"
          isSubmitting={false}
          onClose={onClose}
        />
      );
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(screen.getByLabelText("Close"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("SubmittingState", () => {
    it("renders visualizer always", () => {
      render(<SubmittingState isSuccess={false} />);
      expect(screen.getByTestId("intent-visualizer")).toBeInTheDocument();
    });

    it("renders success banner when isSuccess=true and successMessage provided", () => {
      render(
        <SubmittingState
          isSuccess={true}
          successMessage="Success!"
          successTone="green"
        />
      );
      expect(screen.getByText("Success!")).toBeInTheDocument();
    });

    it("does not render success banner when isSuccess=false even with successMessage", () => {
      render(
        <SubmittingState isSuccess={false} successMessage="Should not show" />
      );
      expect(screen.queryByText("Should not show")).not.toBeInTheDocument();
    });

    it("does not render success banner when isSuccess=true but no successMessage", () => {
      render(<SubmittingState isSuccess={true} />);
      // No banner - no Check icon text, no banner div
      expect(screen.queryByText(/Success/)).not.toBeInTheDocument();
    });

    it("uses indigo tone by default", () => {
      const { container } = render(
        <SubmittingState isSuccess={true} successMessage="Indigo Banner" />
      );
      expect(screen.getByText("Indigo Banner")).toBeInTheDocument();
      // Indigo tone applies indigo classes
      const banner = container.querySelector(".text-indigo-400");
      expect(banner).toBeInTheDocument();
    });

    it("renders successExtra node inside banner", () => {
      render(
        <SubmittingState
          isSuccess={true}
          successMessage="With Extra"
          successTone="green"
          successExtra={<span data-testid="extra-node">Extra</span>}
        />
      );
      expect(screen.getByTestId("extra-node")).toBeInTheDocument();
      expect(screen.getByText("Extra")).toBeInTheDocument();
    });

    it("does not render extra slot when successExtra is not provided", () => {
      const { container } = render(
        <SubmittingState
          isSuccess={true}
          successMessage="No Extra"
          successTone="indigo"
        />
      );
      // ml-auto div should not exist when extra is absent
      expect(container.querySelector(".ml-auto")).not.toBeInTheDocument();
    });
  });

  describe("TransactionActionButton", () => {
    it("renders label and handles click", () => {
      const onClick = vi.fn();
      render(
        <TransactionActionButton
          gradient="bg-blue"
          disabled={false}
          label="Go"
          onClick={onClick}
        />
      );

      const btn = screen.getByText("Go");
      fireEvent.click(btn);
      expect(onClick).toHaveBeenCalled();
    });

    it("is disabled when disabled=true", () => {
      const onClick = vi.fn();
      render(
        <TransactionActionButton
          gradient="bg-blue"
          disabled={true}
          label="Disabled"
          onClick={onClick}
        />
      );
      const btn = screen.getByText("Disabled").closest("button");
      expect(btn).toBeDisabled();
    });

    it("does not call onClick when disabled", () => {
      const onClick = vi.fn();
      render(
        <TransactionActionButton
          gradient="bg-blue"
          disabled={true}
          label="No Click"
          onClick={onClick}
        />
      );
      const btn = screen.getByText("No Click").closest("button")!;
      fireEvent.click(btn);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("TransactionFormActionsWithForm", () => {
    function buildMockForm() {
      const mockSetValue = vi.fn();
      return {
        form: { setValue: mockSetValue } as any,
        mockSetValue,
      };
    }

    it("renders amount input and quick pills and handles interaction", () => {
      const { form, mockSetValue } = buildMockForm();
      const onQuickSelect = vi.fn();
      const onAction = vi.fn();

      render(
        <TransactionFormActionsWithForm
          form={form}
          amount="10"
          onQuickSelect={onQuickSelect}
          onAction={onAction}
          actionLabel="Submit"
          actionDisabled={false}
          actionGradient="bg-test"
          usdPrice={2}
        />
      );

      // Check amount value
      const input = screen.getByDisplayValue("10");
      expect(input).toBeInTheDocument();

      // Check pills
      expect(screen.getByText("25%")).toBeInTheDocument();

      // Interaction: change amount
      fireEvent.change(input, { target: { value: "20" } });
      expect(mockSetValue).toHaveBeenCalledWith("amount", "20", {
        shouldValidate: true,
      });

      // Interaction: quick select MAX
      fireEvent.click(screen.getByText("MAX"));
      expect(onQuickSelect).toHaveBeenCalledWith(1);

      // Interaction: action button
      fireEvent.click(screen.getByText("Submit"));
      expect(onAction).toHaveBeenCalled();
    });

    it("renders all default percent pills: 25%, 50%, 75%, MAX", () => {
      const { form } = buildMockForm();

      render(
        <TransactionFormActionsWithForm
          form={form}
          amount="0"
          onQuickSelect={vi.fn()}
          onAction={vi.fn()}
          actionLabel="Act"
          actionDisabled={false}
          actionGradient="bg-test"
        />
      );

      expect(screen.getByText("25%")).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();
      expect(screen.getByText("75%")).toBeInTheDocument();
      expect(screen.getByText("MAX")).toBeInTheDocument();
    });

    it("calls onQuickSelect with correct values for each pill", () => {
      const { form } = buildMockForm();
      const onQuickSelect = vi.fn();

      render(
        <TransactionFormActionsWithForm
          form={form}
          amount="0"
          onQuickSelect={onQuickSelect}
          onAction={vi.fn()}
          actionLabel="Act"
          actionDisabled={false}
          actionGradient="bg-test"
        />
      );

      fireEvent.click(screen.getByText("25%"));
      expect(onQuickSelect).toHaveBeenCalledWith(0.25);

      fireEvent.click(screen.getByText("50%"));
      expect(onQuickSelect).toHaveBeenCalledWith(0.5);

      fireEvent.click(screen.getByText("75%"));
      expect(onQuickSelect).toHaveBeenCalledWith(0.75);

      fireEvent.click(screen.getByText("MAX"));
      expect(onQuickSelect).toHaveBeenCalledWith(1);
    });

    it("calculates USD value using usdPrice", () => {
      const { form } = buildMockForm();

      render(
        <TransactionFormActionsWithForm
          form={form}
          amount="5"
          onQuickSelect={vi.fn()}
          onAction={vi.fn()}
          actionLabel="Act"
          actionDisabled={false}
          actionGradient="bg-test"
          usdPrice={100}
        />
      );

      // 5 * 100 = 500
      expect(screen.getByText(/\$500/)).toBeInTheDocument();
    });

    it("defaults USD multiplier to 1 when usdPrice is not provided", () => {
      const { form } = buildMockForm();

      render(
        <TransactionFormActionsWithForm
          form={form}
          amount="7"
          onQuickSelect={vi.fn()}
          onAction={vi.fn()}
          actionLabel="Act"
          actionDisabled={false}
          actionGradient="bg-test"
        />
      );

      // 7 * 1 = 7
      expect(screen.getByText(/\$7/)).toBeInTheDocument();
    });

    it("renders zero USD when amount is empty string", () => {
      const { form } = buildMockForm();

      render(
        <TransactionFormActionsWithForm
          form={form}
          amount=""
          onQuickSelect={vi.fn()}
          onAction={vi.fn()}
          actionLabel="Act"
          actionDisabled={false}
          actionGradient="bg-test"
          usdPrice={50}
        />
      );

      // parseFloat("") = NaN, so 0 * 50 = 0 ... actually parseFloat("" || "0") = 0
      expect(screen.getByText(/\$0/)).toBeInTheDocument();
    });

    it("renders action button as disabled when actionDisabled=true", () => {
      const { form } = buildMockForm();
      const onAction = vi.fn();

      render(
        <TransactionFormActionsWithForm
          form={form}
          amount="10"
          onQuickSelect={vi.fn()}
          onAction={onAction}
          actionLabel="Locked"
          actionDisabled={true}
          actionGradient="bg-test"
        />
      );

      const btn = screen.getByText("Locked").closest("button");
      expect(btn).toBeDisabled();
    });

    it("applies custom className to outer container", () => {
      const { form } = buildMockForm();

      const { container } = render(
        <TransactionFormActionsWithForm
          form={form}
          amount="0"
          onQuickSelect={vi.fn()}
          onAction={vi.fn()}
          actionLabel="Act"
          actionDisabled={false}
          actionGradient="bg-test"
          className="custom-wrapper"
        />
      );

      expect(container.querySelector(".custom-wrapper")).toBeInTheDocument();
    });

    it("applies custom amountClassName to amount input section", () => {
      const { form } = buildMockForm();

      const { container } = render(
        <TransactionFormActionsWithForm
          form={form}
          amount="0"
          onQuickSelect={vi.fn()}
          onAction={vi.fn()}
          actionLabel="Act"
          actionDisabled={false}
          actionGradient="bg-test"
          amountClassName="custom-amount"
        />
      );

      expect(container.querySelector(".custom-amount")).toBeInTheDocument();
    });

    it("form.setValue is called with shouldValidate on every change", () => {
      const { form, mockSetValue } = buildMockForm();

      render(
        <TransactionFormActionsWithForm
          form={form}
          amount="1"
          onQuickSelect={vi.fn()}
          onAction={vi.fn()}
          actionLabel="Act"
          actionDisabled={false}
          actionGradient="bg-test"
        />
      );

      const input = screen.getByDisplayValue("1");
      fireEvent.change(input, { target: { value: "99" } });
      expect(mockSetValue).toHaveBeenCalledWith("amount", "99", {
        shouldValidate: true,
      });

      fireEvent.change(input, { target: { value: "" } });
      expect(mockSetValue).toHaveBeenCalledWith("amount", "", {
        shouldValidate: true,
      });
    });
  });
});
