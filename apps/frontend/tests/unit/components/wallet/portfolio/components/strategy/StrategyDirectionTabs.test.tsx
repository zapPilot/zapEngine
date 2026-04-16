import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StrategyDirectionTabs } from "@/components/wallet/portfolio/components/strategy/StrategyDirectionTabs";
import { regimes } from "@/components/wallet/regime/regimeData";

describe("StrategyDirectionTabs", () => {
  const mockOnSelectDirection = vi.fn();

  // Use Greed regime which has both fromLeft and fromRight strategies
  const greedRegime = regimes.find(r => r.id === "g")!; // Greed

  afterEach(() => {
    mockOnSelectDirection.mockClear();
  });

  it("should render tabs when regime has multiple strategies", () => {
    render(
      <StrategyDirectionTabs
        regime={greedRegime}
        activeDirection="fromLeft"
        onSelectDirection={mockOnSelectDirection}
      />
    );

    // Greed has "From Neutral ↑" and "From Peak ↓" tabs
    expect(screen.getByText("From Neutral ↑")).toBeInTheDocument();
    expect(screen.getByText("From Peak ↓")).toBeInTheDocument();
  });

  it("should highlight active tab", () => {
    render(
      <StrategyDirectionTabs
        regime={greedRegime}
        activeDirection="fromLeft"
        onSelectDirection={mockOnSelectDirection}
      />
    );

    const activeTab = screen.getByText("From Neutral ↑").closest("button")!;
    expect(activeTab).toHaveClass("bg-gradient-to-r");
    expect(activeTab).toHaveClass("text-white");
  });

  it("should call onSelectDirection when tab is clicked", async () => {
    const user = userEvent.setup();

    render(
      <StrategyDirectionTabs
        regime={greedRegime}
        activeDirection="fromLeft"
        onSelectDirection={mockOnSelectDirection}
      />
    );

    const tab = screen.getByText("From Peak ↓").closest("button")!;
    await user.click(tab);

    expect(mockOnSelectDirection).toHaveBeenCalledWith("fromRight");
  });

  it("should return null when regime has no directional strategies", () => {
    // Create a mock regime with only default strategy
    const defaultOnlyRegime = {
      ...greedRegime,
      strategies: {
        default: greedRegime.strategies.default,
      },
    };

    const { container } = render(
      <StrategyDirectionTabs
        regime={defaultOnlyRegime as typeof greedRegime}
        activeDirection="default"
        onSelectDirection={mockOnSelectDirection}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it("should stop propagation on tab click", async () => {
    const user = userEvent.setup();
    const parentOnClick = vi.fn();

    render(
      <div onClick={parentOnClick}>
        <StrategyDirectionTabs
          regime={greedRegime}
          activeDirection="fromLeft"
          onSelectDirection={mockOnSelectDirection}
        />
      </div>
    );

    const tab = screen.getByText("From Neutral ↑").closest("button")!;
    await user.click(tab);

    expect(mockOnSelectDirection).toHaveBeenCalled();
    expect(parentOnClick).not.toHaveBeenCalled();
  });

  it("should show inactive tab styling", () => {
    render(
      <StrategyDirectionTabs
        regime={greedRegime}
        activeDirection="fromLeft"
        onSelectDirection={mockOnSelectDirection}
      />
    );

    const inactiveTab = screen.getByText("From Peak ↓").closest("button")!;
    expect(inactiveTab).toHaveClass("bg-gray-800/50");
    expect(inactiveTab).toHaveClass("text-gray-400");
  });
});
