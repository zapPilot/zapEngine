import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReviewModal } from "@/components/wallet/portfolio/views/invest/trading/components/ReviewModal";

import { render, screen } from "../../../../../../../../test-utils";

vi.mock("lucide-react", () => {
  const Icon = () => <svg />;
  return {
    AlertCircle: Icon,
    AlertTriangle: Icon,
    ArrowRight: Icon,
    CheckCircle: Icon,
    Clock: Icon,
    Cpu: Icon,
    Globe: Icon,
    Layers: Icon,
    LineChart: Icon,
    Quote: Icon,
    ShieldCheck: Icon,
    TrendingDown: Icon,
    TrendingUp: Icon,
    XCircle: Icon,
    Zap: Icon,
  };
});

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ isOpen, children }: any) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
  ModalContent: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock(
  "@/components/wallet/portfolio/modals/components/TransactionModalParts",
  () => ({
    TransactionModalHeader: ({ title }: any) => (
      <div data-testid="modal-header">{title}</div>
    ),
    SubmittingState: () => <div data-testid="submitting-state" />,
  })
);

vi.mock("@/lib/ui/classNames", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock(
  "@/components/wallet/portfolio/views/invest/trading/components/ReviewModalTabs",
  () => ({
    VariationImpact: () => (
      <div data-testid="variation-impact">Impact Content</div>
    ),
    VariationStrategy: () => (
      <div data-testid="variation-strategy">Strategy Content</div>
    ),
    VariationRoute: () => (
      <div data-testid="variation-route">Route Content</div>
    ),
  })
);

describe("ReviewModal", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isSubmitting: false,
    intentData: {},
  };

  it("returns null when isOpen is false", () => {
    render(<ReviewModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
  });

  it("renders modal with header title", () => {
    render(<ReviewModal {...defaultProps} />);
    expect(screen.getByTestId("modal")).toBeInTheDocument();
    expect(screen.getByTestId("modal-header")).toBeInTheDocument();
  });

  it("shows default title Review Execution", () => {
    render(<ReviewModal {...defaultProps} />);
    expect(screen.getByTestId("modal-header")).toHaveTextContent(
      "Review Execution"
    );
  });

  it("shows custom title when provided", () => {
    render(<ReviewModal {...defaultProps} title="Custom Title" />);
    expect(screen.getByTestId("modal-header")).toHaveTextContent(
      "Custom Title"
    );
  });

  it("shows tab switcher with Impact, Strategy, Route tabs when not submitting", () => {
    render(<ReviewModal {...defaultProps} />);
    expect(screen.getByText("Impact")).toBeInTheDocument();
    expect(screen.getByText("Strategy")).toBeInTheDocument();
    expect(screen.getByText("Route")).toBeInTheDocument();
  });

  it("hides tab switcher when submitting", () => {
    render(<ReviewModal {...defaultProps} isSubmitting={true} />);
    expect(screen.queryByText("Impact")).not.toBeInTheDocument();
    expect(screen.queryByText("Strategy")).not.toBeInTheDocument();
    expect(screen.queryByText("Route")).not.toBeInTheDocument();
  });

  it("shows Sign & Execute button when not submitting", () => {
    render(<ReviewModal {...defaultProps} />);
    expect(screen.getByText("Sign & Execute")).toBeInTheDocument();
  });

  it("hides confirm button when submitting", () => {
    render(<ReviewModal {...defaultProps} isSubmitting={true} />);
    expect(screen.queryByText("Sign & Execute")).not.toBeInTheDocument();
  });

  it("shows SubmittingState when submitting", () => {
    render(<ReviewModal {...defaultProps} isSubmitting={true} />);
    expect(screen.getByTestId("submitting-state")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked", () => {
    const onConfirm = vi.fn();
    render(<ReviewModal {...defaultProps} onConfirm={onConfirm} />);
    const confirmButton = screen.getByText("Sign & Execute");
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows Impact content by default", () => {
    render(<ReviewModal {...defaultProps} />);
    expect(screen.getByTestId("variation-impact")).toBeInTheDocument();
  });

  it("switches to Strategy tab when Strategy button clicked", () => {
    render(<ReviewModal {...defaultProps} />);
    const strategyTab = screen.getByText("Strategy");
    fireEvent.click(strategyTab);
    expect(screen.getByTestId("variation-strategy")).toBeInTheDocument();
    expect(screen.queryByTestId("variation-impact")).not.toBeInTheDocument();
  });

  it("switches to Route tab when Route button clicked", () => {
    render(<ReviewModal {...defaultProps} />);
    const routeTab = screen.getByText("Route");
    fireEvent.click(routeTab);
    expect(screen.getByTestId("variation-route")).toBeInTheDocument();
    expect(screen.queryByTestId("variation-impact")).not.toBeInTheDocument();
  });
});
