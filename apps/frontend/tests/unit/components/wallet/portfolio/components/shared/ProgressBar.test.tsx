import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "@/components/ui/ProgressBar";

describe("ProgressBar", () => {
  it("renders with label and percentage", () => {
    render(
      <ProgressBar label="Target Spot" percentage={60} color="purple-500" />
    );

    expect(screen.getByText("Target Spot")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("hides percentage when showPercentage is false", () => {
    render(
      <ProgressBar
        label="Target Spot"
        percentage={60}
        color="purple-500"
        showPercentage={false}
      />
    );

    expect(screen.queryByText("60%")).not.toBeInTheDocument();
    expect(screen.getByText("Target Spot")).toBeInTheDocument();
  });

  it("renders without label", () => {
    render(<ProgressBar percentage={75} color="blue-500" />);

    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("applies correct width style", () => {
    const { container } = render(
      <ProgressBar percentage={80} color="emerald-500" />
    );

    const progressFill = container.querySelector(".bg-emerald-500");
    expect(progressFill).toHaveStyle({ width: "80%" });
  });

  it("handles 0% percentage", () => {
    const { container } = render(
      <ProgressBar percentage={0} color="purple-500" />
    );

    const progressFill = container.querySelector(".bg-purple-500");
    expect(progressFill).toHaveStyle({ width: "0%" });
  });

  it("handles 100% percentage", () => {
    const { container } = render(
      <ProgressBar percentage={100} color="blue-500" />
    );

    const progressFill = container.querySelector(".bg-blue-500");
    expect(progressFill).toHaveStyle({ width: "100%" });
  });

  it("applies custom className", () => {
    const { container } = render(
      <ProgressBar
        percentage={50}
        color="purple-500"
        className="custom-class"
      />
    );

    expect(container.querySelector(".custom-class")).toBeInTheDocument();
  });

  it("has transition-all duration-300 class for smooth animations", () => {
    const { container } = render(
      <ProgressBar percentage={50} color="purple-500" />
    );

    const progressFill = container.querySelector(".bg-purple-500");
    expect(progressFill).toHaveClass("transition-all", "duration-300");
  });
});
