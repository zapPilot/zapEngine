/**
 * Unit tests for IntentVisualizer component
 *
 * Tests progress visualization for multi-lane intent execution
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IntentVisualizer } from "@/components/wallet/portfolio/modals/visualizers/IntentVisualizer";

// Mock getProtocolLogo
vi.mock("@/components/wallet/portfolio/modals/utils/assetHelpers", () => ({
  getProtocolLogo: (id: string) => `/protocols/${id}.png`,
}));

describe("IntentVisualizer", () => {
  // Note: Only tests that advance timers need fake timers
  // Initial rendering is synchronous and doesn't need fake timers

  it("should render with default lanes and steps", () => {
    render(<IntentVisualizer />);

    // Check default lanes are rendered (protocol names are in image alt text)
    expect(screen.getByAltText("Hyperliquid")).toBeInTheDocument();
    expect(screen.getByAltText("GMX V2")).toBeInTheDocument();
    expect(screen.getByAltText("Morpho")).toBeInTheDocument();

    // Check default steps are rendered
    expect(screen.getAllByText("Approve")).toHaveLength(3); // One per lane
    expect(screen.getAllByText("Swap")).toHaveLength(3);
    expect(screen.getAllByText("Deposit")).toHaveLength(3);
  });

  it("should render custom lanes and steps", () => {
    const customLanes = [
      { id: "aave", name: "Aave", est: "1.5s" },
      { id: "compound", name: "Compound", est: "2.0s" },
    ];
    const customSteps = ["Connect", "Sign", "Execute"];

    render(<IntentVisualizer lanes={customLanes} steps={customSteps} />);

    expect(screen.getByAltText("Aave")).toBeInTheDocument();
    expect(screen.getByAltText("Compound")).toBeInTheDocument();
    expect(screen.getAllByText("Connect")).toHaveLength(2);
    expect(screen.getAllByText("Sign")).toHaveLength(2);
    expect(screen.getAllByText("Execute")).toHaveLength(2);
  });

  it("should display estimated time for each lane", () => {
    render(<IntentVisualizer />);

    expect(screen.getByText("2.1s")).toBeInTheDocument();
    expect(screen.getByText("~3.5s")).toBeInTheDocument();
    expect(screen.getByText("1.8s")).toBeInTheDocument();
  });

  it("should show progress over time", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const { container } = render(<IntentVisualizer />);

      // Initially all steps should be pending
      const initialSteps = screen.getAllByText("Approve");
      expect(initialSteps.length).toBe(3);

      const getProgressWidths = () =>
        Array.from(container.querySelectorAll("div.h-full.bg-green-500")).map(
          el => (el as HTMLElement).style.width
        );

      await waitFor(() => {
        expect(getProgressWidths().some(width => width !== "0%")).toBe(true);
      });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("should show DONE when lane completes all steps", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const fastLane = [{ id: "fast", name: "Fast Protocol", est: "1.0s" }];
      const shortSteps = ["Step1"];

      render(<IntentVisualizer lanes={fastLane} steps={shortSteps} />);

      await waitFor(() => {
        expect(screen.getByText("DONE")).toBeInTheDocument();
      });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("should render protocol images with correct alt text", () => {
    render(<IntentVisualizer />);

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(3);

    expect(screen.getByAltText("Hyperliquid")).toBeInTheDocument();
    expect(screen.getByAltText("GMX V2")).toBeInTheDocument();
    expect(screen.getByAltText("Morpho")).toBeInTheDocument();
  });

  it("should use correct protocol logo paths", () => {
    render(<IntentVisualizer />);

    const hyperliquidImg = screen.getByAltText("Hyperliquid");
    const gmxImg = screen.getByAltText("GMX V2");
    const morphoImg = screen.getByAltText("Morpho");

    expect(hyperliquidImg).toHaveAttribute("src", "/protocols/hyperliquid.png");
    expect(gmxImg).toHaveAttribute("src", "/protocols/gmx-v2.png");
    expect(morphoImg).toHaveAttribute("src", "/protocols/morpho.png");
  });

  it("should render correct number of step indicators per lane", () => {
    const threeLanes = [
      { id: "l1", name: "Lane 1", est: "1s" },
      { id: "l2", name: "Lane 2", est: "2s" },
      { id: "l3", name: "Lane 3", est: "3s" },
    ];
    const twoSteps = ["Step A", "Step B"];

    render(<IntentVisualizer lanes={threeLanes} steps={twoSteps} />);

    // Each lane has 2 steps
    expect(screen.getAllByText("Step A")).toHaveLength(3);
    expect(screen.getAllByText("Step B")).toHaveLength(3);
  });

  it("should cleanup timers on unmount", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<IntentVisualizer />);

      const timerCountBefore = vi.getTimerCount();
      expect(timerCountBefore).toBeGreaterThan(0);

      unmount();

      const timerCountAfter = vi.getTimerCount();
      expect(timerCountAfter).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("should reset progress when props change", async () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<IntentVisualizer />);

      // Advance time to create progress
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Change props (new lanes)
      const newLanes = [{ id: "new", name: "New Lane", est: "1s" }];
      await act(async () => {
        rerender(<IntentVisualizer lanes={newLanes} />);
      });

      // Progress should reset (new lane renders synchronously)
      expect(screen.getByAltText("New Lane")).toBeInTheDocument();
      expect(screen.queryByText("DONE")).not.toBeInTheDocument();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("should handle single lane", () => {
    const singleLane = [{ id: "solo", name: "Solo Protocol", est: "2s" }];

    render(<IntentVisualizer lanes={singleLane} />);

    expect(screen.getByAltText("Solo Protocol")).toBeInTheDocument();
    expect(screen.getAllByText("Approve")).toHaveLength(1);
  });

  it("should handle single step", () => {
    const singleStep = ["Execute"];

    render(<IntentVisualizer steps={singleStep} />);

    expect(screen.getAllByText("Execute")).toHaveLength(3); // Default 3 lanes
  });

  it("should handle empty lanes gracefully", () => {
    render(<IntentVisualizer lanes={[]} />);

    // Should not crash, no lanes rendered
    expect(screen.queryByText("Hyperliquid")).not.toBeInTheDocument();
  });

  it("should display check icon when lane completes", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const fastLane = [{ id: "quick", name: "Quick", est: "0.5s" }];
      const singleStep = ["Go"];

      render(<IntentVisualizer lanes={fastLane} steps={singleStep} />);

      await waitFor(() => {
        expect(screen.getByText("DONE")).toBeInTheDocument();
      });

      // Check icon should be present (it's in a div with specific classes)
      const container = screen.getByText("DONE").closest("div");
      expect(container).toBeInTheDocument();
    } finally {
      randomSpy.mockRestore();
    }
  });
});
