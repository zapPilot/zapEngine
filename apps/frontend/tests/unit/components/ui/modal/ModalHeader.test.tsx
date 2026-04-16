/**
 * Unit tests for ModalHeader
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModalHeader } from "@/components/ui/modal/ModalHeader";

describe("ModalHeader", () => {
  it("should render title", () => {
    render(<ModalHeader title="Test Title" />);

    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("should render subtitle when provided", () => {
    render(<ModalHeader title="Title" subtitle="Subtitle text" />);

    expect(screen.getByText("Subtitle text")).toBeInTheDocument();
  });

  it("should not render subtitle when not provided", () => {
    render(<ModalHeader title="Title" />);

    expect(screen.queryByText("Subtitle text")).not.toBeInTheDocument();
  });

  it("should render close button when showCloseButton is true and onClose provided", () => {
    const mockOnClose = vi.fn();
    render(
      <ModalHeader title="Title" onClose={mockOnClose} showCloseButton={true} />
    );

    const closeButton = screen.getByLabelText("Close modal");
    expect(closeButton).toBeInTheDocument();
  });

  it("should call onClose when close button is clicked", () => {
    const mockOnClose = vi.fn();
    render(<ModalHeader title="Title" onClose={mockOnClose} />);

    const closeButton = screen.getByLabelText("Close modal");
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should not render close button when showCloseButton is false", () => {
    const mockOnClose = vi.fn();
    render(
      <ModalHeader
        title="Title"
        onClose={mockOnClose}
        showCloseButton={false}
      />
    );

    expect(screen.queryByLabelText("Close modal")).not.toBeInTheDocument();
  });

  it("should not render close button when onClose is not provided", () => {
    render(<ModalHeader title="Title" showCloseButton={true} />);

    expect(screen.queryByLabelText("Close modal")).not.toBeInTheDocument();
  });

  it("should apply correct styling classes", () => {
    render(<ModalHeader title="Title" />);

    const title = screen.getByText("Title");
    expect(title).toHaveClass("text-xl");
    expect(title).toHaveClass("font-bold");
    expect(title).toHaveClass("text-white");
  });
});
