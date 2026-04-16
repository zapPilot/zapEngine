/**
 * Unit tests for GithubIcon component
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GithubIcon } from "@/components/icons/GithubIcon";

describe("GithubIcon", () => {
  it("should render an SVG element", () => {
    render(<GithubIcon data-testid="github-icon" />);

    const svg = screen.getByTestId("github-icon");
    expect(svg.tagName).toBe("svg");
  });

  it("should apply className prop", () => {
    render(<GithubIcon className="w-6 h-6" data-testid="github-icon" />);

    const svg = screen.getByTestId("github-icon");
    expect(svg).toHaveClass("w-6", "h-6");
  });

  it("should have aria-label for accessibility", () => {
    render(<GithubIcon data-testid="github-icon" />);

    const svg = screen.getByTestId("github-icon");
    expect(svg).toHaveAttribute("aria-label", "GitHub");
  });

  it("should spread additional props", () => {
    render(<GithubIcon data-testid="github-icon" data-custom="test" />);

    const svg = screen.getByTestId("github-icon");
    expect(svg).toHaveAttribute("data-custom", "test");
  });

  it("should have correct viewBox attribute", () => {
    render(<GithubIcon data-testid="github-icon" />);

    const svg = screen.getByTestId("github-icon");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  });
});
