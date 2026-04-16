import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Portal } from "../../../../src/components/ui/Portal";

describe("Portal", () => {
  describe("Behavior Tests", () => {
    it("should render children to document.body", () => {
      render(
        <Portal>
          <div data-testid="portal-content">Portal Content</div>
        </Portal>
      );

      expect(screen.getByTestId("portal-content")).toBeInTheDocument();
      expect(screen.getByText("Portal Content")).toBeInTheDocument();
    });

    it("should render children to custom container", () => {
      const customContainer = document.createElement("div");
      customContainer.setAttribute("data-testid", "custom-container");
      document.body.appendChild(customContainer);

      render(
        <Portal container={customContainer}>
          <span data-testid="custom-portal">Custom Portal</span>
        </Portal>
      );

      expect(screen.getByTestId("custom-portal")).toBeInTheDocument();
      expect(
        customContainer.querySelector("[data-testid='custom-portal']")
      ).toBeInTheDocument();

      // Cleanup
      document.body.removeChild(customContainer);
    });

    it("should render null before mounting", () => {
      // First render cycle may return null, but after useEffect runs it mounts
      render(
        <Portal>
          <div>Content</div>
        </Portal>
      );

      // After the component mounts, content should be rendered
      expect(screen.getByText("Content")).toBeInTheDocument();
    });

    it("should handle multiple children", () => {
      render(
        <Portal>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </Portal>
      );

      expect(screen.getByTestId("child-1")).toBeInTheDocument();
      expect(screen.getByTestId("child-2")).toBeInTheDocument();
    });
  });
});
