import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TerminalDropdown } from "@/components/wallet/portfolio/views/backtesting/components/TerminalDropdown";

let clickOutsideCallback: (() => void) | null = null;

vi.mock("@/hooks/ui/useClickOutside", () => ({
  useClickOutside: vi.fn((_ref: unknown, cb: () => void) => {
    clickOutsideCallback = cb;
  }),
}));

const options = [
  { value: "alpha", label: "Alpha Strategy" },
  { value: "beta", label: "Beta Strategy" },
  { value: "gamma", label: "Gamma Strategy" },
];

function renderDropdown(
  overrides: Partial<React.ComponentProps<typeof TerminalDropdown>> = {}
) {
  const mockOnChange = vi.fn();
  const result = render(
    <TerminalDropdown
      options={options}
      value="alpha"
      onChange={mockOnChange}
      {...overrides}
    />
  );
  return { ...result, mockOnChange };
}

describe("TerminalDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clickOutsideCallback = null;
  });

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  it("renders the selected option label", () => {
    renderDropdown();
    expect(screen.getByText("Alpha Strategy")).toBeDefined();
  });

  it("falls back to raw value when no option matches", () => {
    renderDropdown({ value: "unknown_id" });
    expect(screen.getByText("unknown_id")).toBeDefined();
  });

  it("has correct aria attributes when closed", () => {
    renderDropdown();
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-haspopup")).toBe("listbox");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not render the listbox when closed", () => {
    renderDropdown();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Toggle open / close
  // -----------------------------------------------------------------------

  it("opens on click and sets aria-expanded to true", () => {
    renderDropdown();
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe(
      "true"
    );
    expect(screen.getByRole("listbox")).toBeDefined();
  });

  it("closes on second click (toggle)", () => {
    renderDropdown();
    const button = screen.getByRole("button");

    fireEvent.click(button);
    expect(screen.getByRole("listbox")).toBeDefined();

    fireEvent.click(button);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not open when disabled", () => {
    renderDropdown({ disabled: true });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes when click outside callback fires", () => {
    renderDropdown();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeDefined();

    act(() => {
      clickOutsideCallback?.();
    });

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Option selection
  // -----------------------------------------------------------------------

  it("calls onChange and closes when an option is clicked", () => {
    const { mockOnChange } = renderDropdown();
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByText("Beta Strategy"));

    expect(mockOnChange).toHaveBeenCalledWith("beta");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows > prefix for the selected option", () => {
    renderDropdown();
    fireEvent.click(screen.getByRole("button"));

    const listItems = screen.getAllByRole("option");
    const selectedItem = listItems.find(
      li => li.getAttribute("aria-selected") === "true"
    );
    expect(selectedItem?.textContent).toContain(">");
    expect(selectedItem?.textContent).toContain("Alpha Strategy");
  });

  it("shows non-breaking space prefix for unselected options", () => {
    renderDropdown();
    fireEvent.click(screen.getByRole("button"));

    const listItems = screen.getAllByRole("option");
    const unselected = listItems.filter(
      li => li.getAttribute("aria-selected") !== "true"
    );
    for (const item of unselected) {
      expect(item.textContent).toContain("\u00A0");
    }
  });

  // -----------------------------------------------------------------------
  // Keyboard navigation (closed)
  // -----------------------------------------------------------------------

  it("opens on Enter key when closed", () => {
    renderDropdown();
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeDefined();
  });

  it("opens on Space key when closed", () => {
    renderDropdown();
    fireEvent.keyDown(screen.getByRole("button"), { key: " " });
    expect(screen.getByRole("listbox")).toBeDefined();
  });

  it("opens on ArrowDown key when closed", () => {
    renderDropdown();
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Keyboard navigation (open)
  // -----------------------------------------------------------------------

  it("moves focus down with ArrowDown", () => {
    renderDropdown();
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Focus starts at index 0 (alpha). ArrowDown moves to index 1 (beta).
    fireEvent.keyDown(button, { key: "ArrowDown" });

    const listItems = screen.getAllByRole("option");
    expect(listItems[1]?.className).toContain("bg-emerald-400/10");
  });

  it("moves focus up with ArrowUp", () => {
    renderDropdown({ value: "gamma" });
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Focus starts at index 2 (gamma). ArrowUp moves to index 1 (beta).
    fireEvent.keyDown(button, { key: "ArrowUp" });

    const listItems = screen.getAllByRole("option");
    expect(listItems[1]?.className).toContain("bg-emerald-400/10");
  });

  it("does not move focus below 0", () => {
    renderDropdown();
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Focus starts at index 0. ArrowUp should stay at 0.
    fireEvent.keyDown(button, { key: "ArrowUp" });

    const listItems = screen.getAllByRole("option");
    expect(listItems[0]?.className).toContain("bg-emerald-400/10");
  });

  it("does not move focus past the last option", () => {
    renderDropdown({ value: "gamma" });
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Focus starts at index 2 (last). ArrowDown should stay at 2.
    fireEvent.keyDown(button, { key: "ArrowDown" });

    const listItems = screen.getAllByRole("option");
    expect(listItems[2]?.className).toContain("bg-emerald-400/10");
  });

  it("selects the focused option on Enter", () => {
    const { mockOnChange } = renderDropdown();
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Move focus to beta (index 1)
    fireEvent.keyDown(button, { key: "ArrowDown" });
    fireEvent.keyDown(button, { key: "Enter" });

    expect(mockOnChange).toHaveBeenCalledWith("beta");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes on Escape without selecting", () => {
    const { mockOnChange } = renderDropdown();
    const button = screen.getByRole("button");
    fireEvent.click(button);

    fireEvent.keyDown(button, { key: "Escape" });

    expect(mockOnChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Mouse hover updates focus
  // -----------------------------------------------------------------------

  it("updates focus styling on mouse enter", () => {
    renderDropdown();
    fireEvent.click(screen.getByRole("button"));

    const listItems = screen.getAllByRole("option");
    fireEvent.mouseEnter(listItems[2]);

    expect(listItems[2]?.className).toContain("bg-emerald-400/10");
  });

  // -----------------------------------------------------------------------
  // Focus initialization
  // -----------------------------------------------------------------------

  it("initializes focusIndex to the selected value index on open", () => {
    renderDropdown({ value: "beta" });
    fireEvent.click(screen.getByRole("button"));

    const listItems = screen.getAllByRole("option");
    // beta is index 1, should have focused styling
    expect(listItems[1]?.className).toContain("bg-emerald-400/10");
  });

  it("defaults focusIndex to 0 when selected value is not in options", () => {
    renderDropdown({ value: "not_found" });
    fireEvent.click(screen.getByRole("button"));

    const listItems = screen.getAllByRole("option");
    expect(listItems[0]?.className).toContain("bg-emerald-400/10");
  });
});
