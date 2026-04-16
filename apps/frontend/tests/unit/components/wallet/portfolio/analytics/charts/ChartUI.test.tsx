import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ChartGridLines,
  ChartSurface,
  YAxisLabels,
} from "@/components/wallet/portfolio/analytics/charts/ChartUI";

describe("ChartUI", () => {
  describe("ChartGridLines", () => {
    it("renders grid lines at specified positions", () => {
      const { container } = render(
        <ChartGridLines positions={[0, 25, 50, 75, 100]} />
      );
      const lines = container.querySelectorAll(".bg-gray-800\\/40");
      expect(lines).toHaveLength(5);
    });

    it("applies correct top style to each line", () => {
      const { container } = render(<ChartGridLines positions={[20, 80]} />);
      const lines = container.querySelectorAll(".h-px");
      expect(lines[0]).toHaveStyle({ top: "20%" });
      expect(lines[1]).toHaveStyle({ top: "80%" });
    });

    it("handles empty positions array", () => {
      const { container } = render(<ChartGridLines positions={[]} />);
      const lines = container.querySelectorAll(".h-px");
      expect(lines).toHaveLength(0);
    });
  });

  describe("YAxisLabels", () => {
    it("renders labels correctly", () => {
      render(<YAxisLabels labels={["0%", "50%", "100%"]} />);
      expect(screen.getByText("0%")).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();
      expect(screen.getByText("100%")).toBeInTheDocument();
    });

    it("defaults to right alignment", () => {
      const { container } = render(<YAxisLabels labels={["Test"]} />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass("right-2");
    });

    it("supports left alignment", () => {
      const { container } = render(
        <YAxisLabels labels={["Test"]} alignment="left" />
      );
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass("left-2");
    });
  });

  describe("ChartSurface", () => {
    const mockHandlers = {
      handleMouseMove: vi.fn(),
      handleMouseLeave: vi.fn(),
      handlePointerMove: vi.fn(),
      handlePointerDown: vi.fn(),
      handleTouchMove: vi.fn(),
      handleTouchEnd: vi.fn(),
    };

    it("renders with correct viewBox", () => {
      const { container } = render(
        <ChartSurface width={100} height={50} handlers={mockHandlers}>
          <rect />
        </ChartSurface>
      );
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("viewBox", "0 0 100 50");
    });

    it("calls handler on mouse move", () => {
      const { container } = render(
        <ChartSurface width={100} height={50} handlers={mockHandlers}>
          <rect />
        </ChartSurface>
      );
      const svg = container.querySelector("svg")!;
      fireEvent.mouseMove(svg);
      expect(mockHandlers.handleMouseMove).toHaveBeenCalled();
    });

    it("calls handler on mouse leave", () => {
      const { container } = render(
        <ChartSurface width={100} height={50} handlers={mockHandlers}>
          <rect />
        </ChartSurface>
      );
      const svg = container.querySelector("svg")!;
      fireEvent.mouseLeave(svg);
      expect(mockHandlers.handleMouseLeave).toHaveBeenCalled();
    });

    it("calls handler on pointer down", () => {
      const { container } = render(
        <ChartSurface width={100} height={50} handlers={mockHandlers}>
          <rect />
        </ChartSurface>
      );
      const svg = container.querySelector("svg")!;
      fireEvent.pointerDown(svg);
      expect(mockHandlers.handlePointerDown).toHaveBeenCalled();
    });

    it("renders children", () => {
      const { container } = render(
        <ChartSurface width={100} height={50} handlers={mockHandlers}>
          <rect data-testid="child-rect" />
        </ChartSurface>
      );
      expect(
        container.querySelector('[data-testid="child-rect"]')
      ).toBeInTheDocument();
    });
  });
});
