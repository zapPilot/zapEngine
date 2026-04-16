import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RegimeSelector } from "@/components/wallet/portfolio/components/strategy/RegimeSelector";
import { regimes } from "@/components/wallet/regime/regimeData";

describe("RegimeSelector", () => {
  const mockOnSelectRegime = vi.fn();

  const defaultProps = {
    currentRegime: regimes[2], // Neutral
    selectedRegime: regimes[2],
    onSelectRegime: mockOnSelectRegime,
    regimes,
  };

  afterEach(() => {
    mockOnSelectRegime.mockClear();
  });

  it("should render all regimes", () => {
    render(<RegimeSelector {...defaultProps} />);

    expect(screen.getByText("Market Cycle Position")).toBeInTheDocument();
    expect(screen.getByText("Extreme Fear")).toBeInTheDocument();
    expect(screen.getByText("Fear")).toBeInTheDocument();
    expect(screen.getByText("Neutral")).toBeInTheDocument();
    expect(screen.getByText("Greed")).toBeInTheDocument();
    expect(screen.getByText("Extreme Greed")).toBeInTheDocument();
  });

  it("should indicate current regime", () => {
    render(<RegimeSelector {...defaultProps} />);

    const currentLabel = screen.getByText("Current");
    expect(currentLabel).toBeInTheDocument();
  });

  it("should highlight selected regime", () => {
    render(<RegimeSelector {...defaultProps} />);

    const selectedButton = screen.getByText("Neutral").closest("button");
    expect(selectedButton).toHaveClass("bg-gray-800");
    expect(selectedButton).toHaveClass("border-gray-600");
  });

  it("should call onSelectRegime when regime is clicked", async () => {
    const user = userEvent.setup();

    render(<RegimeSelector {...defaultProps} />);

    const greedButton = screen.getByText("Greed").closest("button")!;
    await user.click(greedButton);

    expect(mockOnSelectRegime).toHaveBeenCalledWith("g");
  });

  it("should show viewing indicator when selected is different from current", () => {
    render(
      <RegimeSelector
        {...defaultProps}
        currentRegime={regimes[2]} // Neutral
        selectedRegime={regimes[0]} // Extreme Fear
      />
    );

    const viewingLabel = screen.getByText("Viewing");
    expect(viewingLabel).toBeInTheDocument();

    const currentLabel = screen.getByText("Current");
    expect(currentLabel).toBeInTheDocument();
  });

  it("should show pulse animation on current regime indicator", () => {
    render(<RegimeSelector {...defaultProps} />);

    const neutralButton = screen.getByText("Neutral").closest("button")!;
    const indicator = neutralButton.querySelector(".animate-pulse");
    expect(indicator).toBeInTheDocument();
  });

  it("should handle undefined current regime", () => {
    render(
      <RegimeSelector
        {...defaultProps}
        currentRegime={undefined}
        selectedRegime={regimes[2]}
      />
    );

    expect(screen.queryByText("Current")).not.toBeInTheDocument();
    expect(screen.getByText("Market Cycle Position")).toBeInTheDocument();
  });

  it("should stop propagation on button click", async () => {
    const user = userEvent.setup();
    const parentOnClick = vi.fn();

    render(
      <div onClick={parentOnClick}>
        <RegimeSelector {...defaultProps} />
      </div>
    );

    const button = screen.getByText("Greed").closest("button")!;
    await user.click(button);

    expect(mockOnSelectRegime).toHaveBeenCalled();
    expect(parentOnClick).not.toHaveBeenCalled();
  });
});
