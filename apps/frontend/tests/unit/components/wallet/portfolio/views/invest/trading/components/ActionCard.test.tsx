import { describe, expect, it, vi } from "vitest";

import { ActionCard } from "@/components/wallet/portfolio/views/invest/trading/components/ActionCard";

import { render, screen } from "../../../../../../../../test-utils";

// Mock classNames utility
vi.mock("@/lib/ui/classNames", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

describe("ActionCard", () => {
  it("renders children", () => {
    render(
      <ActionCard>
        <div>Test Content</div>
      </ActionCard>
    );

    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("renders title when provided", () => {
    render(
      <ActionCard title="Test Title">
        <div>Content</div>
      </ActionCard>
    );

    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(
      <ActionCard subtitle="Test Subtitle">
        <div>Content</div>
      </ActionCard>
    );

    expect(screen.getByText("Test Subtitle")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(
      <ActionCard icon={<svg data-testid="test-icon" />}>
        <div>Content</div>
      </ActionCard>
    );

    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });

  it("does NOT render header section when no title/subtitle/icon", () => {
    const { container } = render(
      <ActionCard>
        <div>Content</div>
      </ActionCard>
    );

    // The header div should not exist when all header props are undefined
    const headerDiv = container.querySelector(
      ".flex.items-center.justify-between.mb-8"
    );
    expect(headerDiv).not.toBeInTheDocument();
  });

  it("renders footer when provided", () => {
    render(
      <ActionCard footer={<div>Footer Content</div>}>
        <div>Content</div>
      </ActionCard>
    );

    expect(screen.getByText("Footer Content")).toBeInTheDocument();
  });

  it("does NOT render footer section when not provided", () => {
    const { container } = render(
      <ActionCard>
        <div>Content</div>
      </ActionCard>
    );

    // The footer div should not exist when footer prop is undefined
    const footerDiv = container.querySelector(".mt-8.pt-8.border-t");
    expect(footerDiv).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <ActionCard className="custom-class">
        <div>Content</div>
      </ActionCard>
    );

    // Check that the outer div has both the default classes and the custom class
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain("custom-class");
  });
});
