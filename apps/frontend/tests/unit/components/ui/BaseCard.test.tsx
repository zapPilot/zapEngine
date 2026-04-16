import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BaseCard } from "../../../../src/components/ui/BaseCard";

vi.mock("framer-motion", async () => {
  const { setupFramerMotionMocks } =
    await import("../../../utils/framerMotionMocks");

  return setupFramerMotionMocks();
});

describe("BaseCard", () => {
  describe("Snapshot Tests - UI Design Freeze", () => {
    it("should match snapshot with glass variant (default)", () => {
      const { container } = render(
        <BaseCard testId="card">Glass content</BaseCard>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("should match snapshot with empty variant", () => {
      const { container } = render(
        <BaseCard variant="empty" testId="card">
          Empty state content
        </BaseCard>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("should match snapshot with error variant", () => {
      const { container } = render(
        <BaseCard variant="error" testId="card">
          Error content
        </BaseCard>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("should match snapshot with solid variant", () => {
      const { container } = render(
        <BaseCard variant="solid" testId="card">
          Solid content
        </BaseCard>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("should match snapshot with different padding options", () => {
      const { container } = render(
        <BaseCard padding="sm" testId="card">
          Small padding
        </BaseCard>
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe("Behavior Tests", () => {
    it("should render children correctly", () => {
      render(<BaseCard testId="card">Test content</BaseCard>);
      expect(screen.getByText("Test content")).toBeInTheDocument();
    });

    it("should apply test id", () => {
      render(<BaseCard testId="my-card">Content</BaseCard>);
      expect(screen.getByTestId("my-card")).toBeInTheDocument();
    });

    it("should apply custom className", () => {
      render(
        <BaseCard testId="card" className="custom-class">
          Content
        </BaseCard>
      );
      const card = screen.getByTestId("card");
      expect(card).toHaveClass("custom-class");
    });

    it("should apply border classes when border=true (default)", () => {
      render(<BaseCard testId="card">Content</BaseCard>);
      const card = screen.getByTestId("card");
      expect(card).toHaveClass("border", "border-gray-800");
    });

    it("should not apply border classes when border=false", () => {
      render(
        <BaseCard testId="card" border={false}>
          Content
        </BaseCard>
      );
      const card = screen.getByTestId("card");
      expect(card).not.toHaveClass("border-gray-800");
    });

    it("should apply shadow classes when shadow=true", () => {
      render(
        <BaseCard testId="card" shadow>
          Content
        </BaseCard>
      );
      const card = screen.getByTestId("card");
      expect(card).toHaveClass("shadow-xl");
    });

    it("should render as static div when animate=false", () => {
      render(
        <BaseCard testId="card" animate={false}>
          Content
        </BaseCard>
      );
      expect(screen.getByTestId("card")).toBeInTheDocument();
    });

    it("should apply role attribute when provided", () => {
      render(
        <BaseCard testId="card" role="alert">
          Content
        </BaseCard>
      );
      const card = screen.getByTestId("card");
      expect(card).toHaveAttribute("role", "alert");
    });

    it("should apply aria-live attribute when provided", () => {
      render(
        <BaseCard testId="card" ariaLive="polite">
          Content
        </BaseCard>
      );
      const card = screen.getByTestId("card");
      expect(card).toHaveAttribute("aria-live", "polite");
    });
  });
});
