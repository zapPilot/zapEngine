import { render, screen } from "@testing-library/react";
import { AlertCircle } from "lucide-react";
import { describe, expect, it } from "vitest";

import { EmptyStateCard } from "@/components/ui/EmptyStateCard";

describe("EmptyStateCard", () => {
  it("renders icon and message", () => {
    render(<EmptyStateCard icon={AlertCircle} message="No data available" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders optional description", () => {
    render(
      <EmptyStateCard
        icon={AlertCircle}
        message="Empty"
        description="Try again later"
      />
    );
    expect(screen.getByText("Try again later")).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    render(<EmptyStateCard icon={AlertCircle} message="Empty" />);
    expect(screen.queryByText("Try again later")).not.toBeInTheDocument();
  });

  it("applies custom iconClassName", () => {
    const { container } = render(
      <EmptyStateCard
        icon={AlertCircle}
        message="Test"
        iconClassName="text-blue-500"
      />
    );
    const svg = container.querySelector("svg");
    expect(svg?.className.baseVal || svg?.getAttribute("class")).toContain(
      "text-blue-500"
    );
  });
});
