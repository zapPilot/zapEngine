import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TooltipWrapper } from "@/components/charts/tooltipContent/TooltipWrapper";

describe("TooltipWrapper", () => {
  it("should render date", () => {
    render(
      <TooltipWrapper date="2024-01-01">
        <div>Content</div>
      </TooltipWrapper>
    );
    expect(screen.getByText("2024-01-01")).toBeInTheDocument();
  });

  it("should render children", () => {
    render(
      <TooltipWrapper date="2024-01-01">
        <div data-testid="child">Content</div>
      </TooltipWrapper>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("should apply normal spacing by default", () => {
    render(
      <TooltipWrapper date="2024-01-01">
        <div>Content</div>
      </TooltipWrapper>
    );
    // Wrapper div around children has space-y-1.5
    // It's the second div in fragment.
    // We can find by text content parent or checking structure.
    // Let's use getByText Content -> parent.
    const content = screen.getByText("Content").parentElement;
    expect(content).toHaveClass("space-y-1.5");
  });

  it("should apply tight spacing when requested", () => {
    render(
      <TooltipWrapper date="2024-01-01" spacing="tight">
        <div>Content</div>
      </TooltipWrapper>
    );
    const content = screen.getByText("Content").parentElement;
    expect(content).toHaveClass("space-y-1");
  });
});
