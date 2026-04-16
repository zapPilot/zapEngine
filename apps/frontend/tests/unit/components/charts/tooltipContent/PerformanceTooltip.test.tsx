import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PerformanceTooltip } from "@/components/charts/tooltipContent/PerformanceTooltip";
import { TooltipWrapper } from "@/components/charts/tooltipContent/TooltipWrapper";
import type { PerformanceHoverData } from "@/types/ui/chartHover";

describe("TooltipWrapper", () => {
  it("renders date and children", () => {
    render(
      <TooltipWrapper date="2024-01-15">
        <div data-testid="child">Content</div>
      </TooltipWrapper>
    );

    expect(screen.getByText("2024-01-15")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("defaults to normal spacing", () => {
    const { container } = render(
      <TooltipWrapper date="2024-01-15">
        <div>Content</div>
      </TooltipWrapper>
    );

    expect(container.querySelector(".space-y-1\\.5")).toBeInTheDocument();
  });

  it("applies tight spacing when specified", () => {
    const { container } = render(
      <TooltipWrapper date="2024-01-15" spacing="tight">
        <div>Content</div>
      </TooltipWrapper>
    );

    expect(container.querySelector(".space-y-1")).toBeInTheDocument();
  });
});

describe("PerformanceTooltip", () => {
  it("renders portfolio value", () => {
    const data: PerformanceHoverData = {
      date: "2024-01-15",
      value: 10000,
    };

    render(<PerformanceTooltip data={data} />);

    expect(screen.getByText("Portfolio Value")).toBeInTheDocument();
  });
});
