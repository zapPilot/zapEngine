import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CompactSelectorButton } from "@/components/wallet/portfolio/modals/components/CompactSelectorButton";

describe("CompactSelectorButton", () => {
  it("renders label, value and icon", () => {
    render(
      <CompactSelectorButton
        label="Token"
        value="USDC"
        icon={<span data-testid="icon">ICON</span>}
      />
    );
    expect(screen.getByText("Token")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("handles click events", () => {
    const onClick = vi.fn();
    render(
      <CompactSelectorButton
        label="Token"
        value="USDC"
        icon={<span>icon</span>}
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });

  it("applies rotation class when open", () => {
    const { container } = render(
      <CompactSelectorButton
        label="Token"
        value="USDC"
        icon={<span>icon</span>}
        isOpen={true}
      />
    );
    // ChevronDown is the last child usually or found by class.
    // We can check if `rotate-180` class exists in the container HTML
    const chevron = container.querySelector(".rotate-180");
    expect(chevron).toBeInTheDocument();
  });

  it("does not apply rotation class when closed", () => {
    const { container } = render(
      <CompactSelectorButton
        label="Token"
        value="USDC"
        icon={<span>icon</span>}
        isOpen={false}
      />
    );
    const chevron = container.querySelector(".rotate-180");
    expect(chevron).not.toBeInTheDocument();
  });
});
