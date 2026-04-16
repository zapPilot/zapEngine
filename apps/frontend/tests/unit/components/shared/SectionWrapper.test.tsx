import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SectionWrapper } from "@/components/shared/SectionWrapper";
import type { SectionState } from "@/types/portfolio-progressive";

vi.mock("framer-motion", async () => {
  const { setupFramerMotionMocks } =
    await import("../../../utils/framerMotionMocks");

  return setupFramerMotionMocks();
});

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="alert-icon">Alert</span>,
  RefreshCw: () => <span data-testid="refresh-icon">Refresh</span>,
}));

// Helper to create mock section states
function createLoadingState<T>(): SectionState<T> {
  return { isLoading: true, data: null, error: null };
}

function createDataState<T>(data: T): SectionState<T> {
  return { isLoading: false, data, error: null };
}

function createErrorState<T>(message: string): SectionState<T> {
  return { isLoading: false, data: null, error: new Error(message) };
}

describe("SectionWrapper", () => {
  describe("Snapshot Tests - UI Design Freeze", () => {
    it("should match snapshot in loading state with default skeleton", () => {
      const { container } = render(
        <SectionWrapper state={createLoadingState<string>()}>
          {data => <div>{data}</div>}
        </SectionWrapper>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("should match snapshot in loading state with custom skeleton", () => {
      const { container } = render(
        <SectionWrapper
          state={createLoadingState<string>()}
          skeleton={<div className="custom-skeleton">Loading...</div>}
        >
          {data => <div>{data}</div>}
        </SectionWrapper>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("should match snapshot in error state", () => {
      const { container } = render(
        <SectionWrapper state={createErrorState<string>("Test error message")}>
          {data => <div>{data}</div>}
        </SectionWrapper>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("should match snapshot in data state", () => {
      const { container } = render(
        <SectionWrapper state={createDataState("Test data")}>
          {data => <div data-testid="content">{data}</div>}
        </SectionWrapper>
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe("Behavior Tests", () => {
    it("should render children with data when loaded", () => {
      render(
        <SectionWrapper state={createDataState({ name: "Test" })}>
          {data => <div data-testid="content">{data.name}</div>}
        </SectionWrapper>
      );
      expect(screen.getByTestId("content")).toHaveTextContent("Test");
    });

    it("should show error state with message", () => {
      render(
        <SectionWrapper state={createErrorState<string>("Network error")}>
          {data => <div>{data}</div>}
        </SectionWrapper>
      );
      expect(screen.getByText("Failed to load section")).toBeInTheDocument();
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    it("should show alert icon in error state", () => {
      render(
        <SectionWrapper state={createErrorState<string>("Error")}>
          {data => <div>{data}</div>}
        </SectionWrapper>
      );
      expect(screen.getByTestId("alert-icon")).toBeInTheDocument();
    });

    it("should show refresh button in error state", () => {
      render(
        <SectionWrapper state={createErrorState<string>("Error")}>
          {data => <div>{data}</div>}
        </SectionWrapper>
      );
      expect(screen.getByTestId("refresh-icon")).toBeInTheDocument();
    });

    it("should render default skeleton when loading without custom skeleton", () => {
      const { container } = render(
        <SectionWrapper state={createLoadingState<string>()}>
          {data => <div>{data}</div>}
        </SectionWrapper>
      );
      expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    });

    it("should render custom skeleton when provided", () => {
      render(
        <SectionWrapper
          state={createLoadingState<string>()}
          skeleton={<div data-testid="custom-skeleton">Loading...</div>}
        >
          {data => <div>{data}</div>}
        </SectionWrapper>
      );
      expect(screen.getByTestId("custom-skeleton")).toBeInTheDocument();
    });

    it("should apply custom className", () => {
      const { container } = render(
        <SectionWrapper
          state={createDataState("Test")}
          className="custom-class"
        >
          {data => <div>{data}</div>}
        </SectionWrapper>
      );
      expect(container.querySelector(".custom-class")).toBeInTheDocument();
    });

    it("should return null when no data and not loading/error", () => {
      const emptyState: SectionState<string> = {
        isLoading: false,
        data: null,
        error: null,
      };
      const { container } = render(
        <SectionWrapper state={emptyState}>
          {data => <div>{data}</div>}
        </SectionWrapper>
      );
      expect(container.firstChild).toBeNull();
    });

    it("calls window.location.reload when retry button is clicked", () => {
      const reloadMock = vi.fn();
      Object.defineProperty(window, "location", {
        value: { ...window.location, reload: reloadMock },
        configurable: true,
      });

      render(
        <SectionWrapper state={createErrorState<string>("Error")}>
          {data => <div>{data}</div>}
        </SectionWrapper>
      );

      const retryButton = screen.getByTitle("Retry");
      retryButton.click();

      expect(reloadMock).toHaveBeenCalledOnce();
    });
  });
});
