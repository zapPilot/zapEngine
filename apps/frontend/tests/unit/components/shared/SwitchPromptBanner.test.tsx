/**
 * Unit tests for SwitchPromptBanner component
 *
 * Tests the visitor mode indicator banner that appears when
 * viewing another user's bundle.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SwitchPromptBanner } from "@/components/layout/banners/SwitchPromptBanner";

// Mock StickyBannerShell to avoid z-index and styling dependencies
vi.mock("@/components/layout/banners/StickyBannerShell", () => ({
  StickyBannerShell: ({
    children,
    ...props
  }: React.PropsWithChildren<{ "data-testid"?: string }>) => (
    <div data-testid={props["data-testid"]}>{children}</div>
  ),
}));

describe("SwitchPromptBanner", () => {
  const mockOnSwitch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Visibility", () => {
    it("renders hidden element when show is false", () => {
      render(
        <SwitchPromptBanner
          show={false}
          bundleUserName="Test User"
          onSwitch={mockOnSwitch}
        />
      );

      const banner = screen.getByTestId("switch-prompt-banner");
      expect(banner).toHaveClass("hidden");
    });

    it("renders visible banner when show is true", () => {
      render(
        <SwitchPromptBanner
          show={true}
          bundleUserName="Test User"
          onSwitch={mockOnSwitch}
        />
      );

      const banner = screen.getByTestId("switch-prompt-banner");
      expect(banner).not.toHaveClass("hidden");
    });
  });

  describe("Content Display", () => {
    it("displays the bundle user name", () => {
      render(
        <SwitchPromptBanner
          show={true}
          bundleUserName="Alice"
          onSwitch={mockOnSwitch}
        />
      );

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText(/Viewing/)).toBeInTheDocument();
      expect(screen.getByText(/bundle/)).toBeInTheDocument();
    });

    it("displays 'another user' when bundleUserName is undefined", () => {
      render(
        <SwitchPromptBanner
          show={true}
          bundleUserName={undefined}
          onSwitch={mockOnSwitch}
        />
      );

      expect(screen.getByText("another user")).toBeInTheDocument();
    });

    it("displays visitor mode indicator emoji", () => {
      render(
        <SwitchPromptBanner
          show={true}
          bundleUserName="Bob"
          onSwitch={mockOnSwitch}
        />
      );

      expect(screen.getByText("👁️")).toBeInTheDocument();
    });

    it("renders Switch to mine button", () => {
      render(
        <SwitchPromptBanner
          show={true}
          bundleUserName="Charlie"
          onSwitch={mockOnSwitch}
        />
      );

      expect(screen.getByTestId("switch-button")).toBeInTheDocument();
      expect(screen.getByText("Switch to mine")).toBeInTheDocument();
    });
  });

  describe("Actions", () => {
    it("calls onSwitch when Switch button is clicked", () => {
      render(
        <SwitchPromptBanner
          show={true}
          bundleUserName="Dave"
          onSwitch={mockOnSwitch}
        />
      );

      fireEvent.click(screen.getByTestId("switch-button"));

      expect(mockOnSwitch).toHaveBeenCalledTimes(1);
    });

    it("does not call onSwitch when banner is hidden", () => {
      render(
        <SwitchPromptBanner
          show={false}
          bundleUserName="Eve"
          onSwitch={mockOnSwitch}
        />
      );

      // The button should not be visible when hidden
      expect(screen.queryByTestId("switch-button")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has aria-hidden when not shown", () => {
      render(
        <SwitchPromptBanner
          show={false}
          bundleUserName="Test"
          onSwitch={mockOnSwitch}
        />
      );

      const banner = screen.getByTestId("switch-prompt-banner");
      expect(banner).toHaveAttribute("aria-hidden", "true");
    });
  });
});
