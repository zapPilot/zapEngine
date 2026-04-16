/**
 * Unit tests for InitialDataLoadingState component.
 *
 * This component displays a loading state with status-specific messages
 * during ETL (Extract, Transform, Load) job processing for new wallets.
 *
 * Test Coverage:
 * - Visual rendering (spinner, heading, description, layout)
 * - Status message variants (pending, processing, completed, failed, etc.)
 * - Status badge styling and conditional rendering
 * - Accessibility features
 *
 * @see src/components/wallet/InitialDataLoadingState.tsx
 */

import { describe, expect, it, vi } from "vitest";

import { InitialDataLoadingState } from "@/components/wallet/InitialDataLoadingState";

import { render, screen } from "../../../test-utils";

function getExpectedStatusBadgeText(
  status: "pending" | "processing" | "completed" | "failed"
): string {
  switch (status) {
    case "pending":
      return "Job queued...";
    case "processing":
      return "Fetching data from DeBank...";
    case "completed":
      return "Finalizing...";
    case "failed":
      return "Something went wrong";
    default:
      return "Initializing...";
  }
}

// Mock lucide-react icons — spread originals so transitive imports (e.g. ToastNotification) work
vi.mock("lucide-react", async importOriginal => ({
  ...(await importOriginal<typeof import("lucide-react")>()),
  Loader2: (props: any) => (
    <svg data-testid="loader-icon" className={props.className} {...props} />
  ),
}));

describe("InitialDataLoadingState", () => {
  describe("Visual Rendering", () => {
    it("renders loading spinner with purple glow effect", () => {
      render(<InitialDataLoadingState />);

      // Verify spinner icon is present
      const spinner = screen.getByTestId("loader-icon");
      expect(spinner).toBeInTheDocument();

      // Verify purple color and spin animation classes
      expect(spinner).toHaveClass("text-purple-400");
      expect(spinner).toHaveClass("animate-spin");
      expect(spinner).toHaveClass("w-16");
      expect(spinner).toHaveClass("h-16");

      // Verify z-index for proper layering
      expect(spinner).toHaveClass("relative");
      expect(spinner).toHaveClass("z-10");
    });

    it("renders purple glow background effect behind spinner", () => {
      const { container } = render(<InitialDataLoadingState />);

      // Find the blur effect div (should be absolute positioned with blur)
      const glowEffect = container.querySelector(
        ".absolute.inset-0.bg-purple-500\\/20.blur-xl"
      );
      expect(glowEffect).toBeInTheDocument();
      expect(glowEffect).toHaveClass("rounded-full");
    });

    it("displays static heading and description text", () => {
      render(<InitialDataLoadingState />);

      // Verify heading
      const heading = screen.getByRole("heading", { level: 3 });
      expect(heading).toHaveTextContent("Fetching Wallet Data");
      expect(heading).toHaveClass("text-xl");
      expect(heading).toHaveClass("font-semibold");
      expect(heading).toHaveClass("text-white");

      // Verify description mentions first-time wallet and time estimate
      expect(
        screen.getByText(/this is the first time we've seen this wallet/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/this usually takes 2-5 minutes/i)
      ).toBeInTheDocument();
    });

    it("renders with minimum height of 400px and centered layout", () => {
      const { container } = render(<InitialDataLoadingState />);

      // The root div should have min-h-[400px] and centering classes
      const rootDiv = container.firstChild as HTMLElement;
      expect(rootDiv).toHaveClass("min-h-[400px]");
      expect(rootDiv).toHaveClass("flex");
      expect(rootDiv).toHaveClass("flex-col");
      expect(rootDiv).toHaveClass("items-center");
      expect(rootDiv).toHaveClass("justify-center");
      expect(rootDiv).toHaveClass("text-center");
    });
  });

  describe("Status Message Display", () => {
    it("does not show status badge when status is undefined", () => {
      const { container } = render(<InitialDataLoadingState />);

      // Should not render any status badge when status is undefined
      const badge = container.querySelector(".text-purple-300");
      expect(badge).not.toBeInTheDocument();
    });

    it("shows 'Initializing...' when status is 'idle'", () => {
      render(<InitialDataLoadingState status="idle" />);

      expect(screen.getByText("Initializing...")).toBeInTheDocument();
    });

    it("shows 'Job queued...' when status is 'pending'", () => {
      render(<InitialDataLoadingState status="pending" />);

      expect(screen.getByText("Job queued...")).toBeInTheDocument();
    });

    it("shows 'Fetching data from DeBank...' when status is 'processing'", () => {
      render(<InitialDataLoadingState status="processing" />);

      expect(
        screen.getByText("Fetching data from DeBank...")
      ).toBeInTheDocument();
    });

    it("shows 'Finalizing...' when status is 'completed'", () => {
      render(<InitialDataLoadingState status="completed" />);

      expect(screen.getByText("Finalizing...")).toBeInTheDocument();
    });

    it("shows 'Something went wrong' when status is 'failed'", () => {
      render(<InitialDataLoadingState status="failed" />);

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    it("shows 'Initializing...' for unknown status values", () => {
      // @ts-expect-error Testing invalid status for robustness
      render(<InitialDataLoadingState status="unknown-status" />);

      expect(screen.getByText("Initializing...")).toBeInTheDocument();
    });
  });

  describe("Status Badge Styling", () => {
    it("applies purple-themed badge styling when status is provided", () => {
      render(<InitialDataLoadingState status="pending" />);

      const badge = screen.getByText("Job queued...");

      // Verify text styling
      expect(badge).toHaveClass("text-sm");
      expect(badge).toHaveClass("font-medium");
      expect(badge).toHaveClass("text-purple-300");

      // Verify background and border
      expect(badge).toHaveClass("bg-purple-500/10");
      expect(badge).toHaveClass("border");
      expect(badge).toHaveClass("border-purple-500/20");

      // Verify shape and spacing
      expect(badge).toHaveClass("rounded-full");
      expect(badge).toHaveClass("px-4");
      expect(badge).toHaveClass("py-2");
    });

    it("renders status badge for all valid status values", () => {
      const statuses = [
        "pending",
        "processing",
        "completed",
        "failed",
      ] as const;

      for (const status of statuses) {
        const { unmount } = render(<InitialDataLoadingState status={status} />);

        // Each status should render a badge with the purple theme
        const badge = screen.getByText(getExpectedStatusBadgeText(status));

        expect(badge).toHaveClass("text-purple-300");
        expect(badge).toHaveClass("bg-purple-500/10");

        unmount();
      }
    });
  });

  describe("Accessibility", () => {
    it("provides semantic heading hierarchy", () => {
      render(<InitialDataLoadingState />);

      // Verify h3 heading exists and is properly structured
      const heading = screen.getByRole("heading", { level: 3 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent("Fetching Wallet Data");
    });

    it("provides descriptive text for screen readers", () => {
      render(<InitialDataLoadingState status="processing" />);

      // Verify description provides context about what's happening
      expect(
        screen.getByText(/we're fetching your on-chain positions/i)
      ).toBeInTheDocument();

      // Verify status message provides progress information
      expect(
        screen.getByText("Fetching data from DeBank...")
      ).toBeInTheDocument();
    });

    it("uses sufficient color contrast for text elements", () => {
      render(<InitialDataLoadingState status="pending" />);

      // Heading should be white for maximum contrast
      const heading = screen.getByRole("heading");
      expect(heading).toHaveClass("text-white");

      // Description should be gray-400 for secondary text
      const description = screen.getByText(/this is the first time/i);
      expect(description).toHaveClass("text-gray-400");

      // Status badge should use purple-300 which has good contrast on dark backgrounds
      const statusBadge = screen.getByText("Job queued...");
      expect(statusBadge).toHaveClass("text-purple-300");
    });

    it("maintains readable layout with appropriate spacing", () => {
      const { container } = render(
        <InitialDataLoadingState status="processing" />
      );

      // Verify proper spacing between sections
      const contentWrapper = container.querySelector(".space-y-6");
      expect(contentWrapper).toBeInTheDocument();

      // Verify text section has spacing
      const textSection = container.querySelector(".space-y-2");
      expect(textSection).toBeInTheDocument();

      // Verify max-width for readability
      expect(textSection).toHaveClass("max-w-md");
    });
  });

  describe("Component Structure", () => {
    it("renders all sections in correct order", () => {
      const { container } = render(
        <InitialDataLoadingState status="pending" />
      );

      const sections = container.querySelectorAll(".space-y-6 > *");

      // Should have 3 sections: spinner container, text content, status badge
      expect(sections.length).toBe(3);

      // First section: spinner with glow effect
      expect(
        sections[0].querySelector("[data-testid='loader-icon']")
      ).toBeInTheDocument();

      // Second section: heading and description
      expect(sections[1].querySelector("h3")).toBeInTheDocument();
      expect(sections[1].querySelector("p")).toBeInTheDocument();

      // Third section: status badge
      expect(sections[2]).toHaveTextContent("Job queued...");
    });

    it("maintains consistent styling across different statuses", () => {
      const statuses = [
        "pending",
        "processing",
        "completed",
        "failed",
      ] as const;

      for (const status of statuses) {
        const { container, unmount } = render(
          <InitialDataLoadingState status={status} />
        );

        // All statuses should have the same root classes
        const root = container.firstChild as HTMLElement;
        expect(root).toHaveClass(
          "flex",
          "flex-col",
          "items-center",
          "justify-center"
        );
        expect(root).toHaveClass("min-h-[400px]");
        expect(root).toHaveClass("text-center");
        expect(root).toHaveClass("p-8");

        unmount();
      }
    });
  });
});
