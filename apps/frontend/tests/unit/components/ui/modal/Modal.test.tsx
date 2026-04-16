import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Modal } from "@/components/ui/modal/Modal";
import { ModalContent } from "@/components/ui/modal/ModalContent";
import { ModalFooter } from "@/components/ui/modal/ModalFooter";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: {
    div: ({ children, className, onClick, ...props }: any) => (
      <div className={className} onClick={onClick} {...props}>
        {children}
      </div>
    ),
  },
}));

// Mock ModalBackdrop to simplify testing
vi.mock("@/components/ui/modal/ModalBackdrop", () => ({
  ModalBackdrop: ({ children, onDismiss, innerClassName }: any) => (
    <div data-testid="backdrop" onClick={onDismiss}>
      <div data-testid="modal-inner" className={innerClassName}>
        {children}
      </div>
    </div>
  ),
}));

describe("Modal", () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = ""; // Reset overflow
  });

  afterEach(() => {
    document.body.style.overflow = ""; // Cleanup
  });

  it("renders null when not open", () => {
    const { container } = render(
      <Modal isOpen={false} onClose={mockOnClose}>
        <div>Content</div>
      </Modal>
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders children when open", () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <div data-testid="content">Modal Content</div>
      </Modal>
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("closes on ESC key press", () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <div>Content</div>
      </Modal>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on non-ESC keys", () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <div>Content</div>
      </Modal>
    );

    fireEvent.keyDown(document, { key: "Enter" });
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("closes on backdrop click when closeOnBackdropClick is true (default)", () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <div>Content</div>
      </Modal>
    );

    fireEvent.click(screen.getByTestId("backdrop"));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on backdrop click when closeOnBackdropClick is false", () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} closeOnBackdropClick={false}>
        <div>Content</div>
      </Modal>
    );

    fireEvent.click(screen.getByTestId("backdrop"));
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("applies correct maxWidth class", () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} maxWidth="xl">
        <div>Content</div>
      </Modal>
    );

    expect(screen.getByTestId("modal-inner")).toHaveClass("max-w-xl");
  });

  it("applies custom className", () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} className="custom-class">
        <div>Content</div>
      </Modal>
    );

    expect(screen.getByTestId("modal-inner")).toHaveClass("custom-class");
  });

  it("locks body scroll when open", () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <div>Content</div>
      </Modal>
    );

    expect(document.body.style.overflow).toBe("hidden");
  });
});

describe("ModalContent", () => {
  it("renders children", () => {
    render(
      <ModalContent>
        <p data-testid="text">Test</p>
      </ModalContent>
    );
    expect(screen.getByTestId("text")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <ModalContent className="my-class">
        <p>Test</p>
      </ModalContent>
    );
    // ModalContent wraps in a div with space-y-6 + custom class
    expect(screen.getByText("Test").parentElement).toHaveClass("my-class");
  });
});

describe("ModalFooter", () => {
  it("renders children", () => {
    render(
      <ModalFooter>
        <button data-testid="btn">OK</button>
      </ModalFooter>
    );
    expect(screen.getByTestId("btn")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <ModalFooter className="footer-class">
        <button>OK</button>
      </ModalFooter>
    );
    expect(screen.getByText("OK").parentElement).toHaveClass("footer-class");
  });
});
