/**
 * Footer Unit Tests
 *
 * Tests for the Footer component
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Footer } from "@/components/Footer/Footer";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  MessageCircle: () => <svg data-testid="discord-icon" />,
  MessageSquare: () => <svg data-testid="farcaster-icon" />,
  Send: () => <svg data-testid="telegram-icon" />,
  X: () => <svg data-testid="x-icon" />,
}));

// Mock custom icon
vi.mock("@/components/icons/GithubIcon", () => ({
  GithubIcon: () => <svg data-testid="github-icon" />,
}));

describe("Footer", () => {
  it("should render footer element", () => {
    render(<Footer />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("should render social links", () => {
    render(<Footer />);

    // Check for X (Twitter) link
    expect(screen.getAllByLabelText(/Visit our X/)).toHaveLength(2); // Mobile + Desktop
  });

  it("should render copyright with current year", () => {
    render(<Footer />);
    const currentYear = new Date().getFullYear();

    // Should appear twice (mobile + desktop layout)
    const copyrightElements = screen.getAllByText(
      new RegExp(`© ${currentYear} Zap Pilot`)
    );
    expect(copyrightElements.length).toBeGreaterThan(0);
  });

  it("should apply custom className", () => {
    render(<Footer className="custom-footer-class" />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("custom-footer-class");
  });

  it("should apply custom containerClassName", () => {
    const { container } = render(<Footer containerClassName="max-w-5xl" />);
    expect(container.querySelector(".max-w-5xl")).toBeInTheDocument();
  });

  it("should have default styling classes", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("border-t");
    expect(footer).toHaveClass("border-gray-800");
    expect(footer).toHaveClass("bg-gray-900");
  });

  describe("Social Links", () => {
    it("should have correct link targets", () => {
      render(<Footer />);
      const links = screen.getAllByRole("link");

      for (const link of links) {
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
      }
    });

    it("should have all expected social platforms", () => {
      render(<Footer />);

      expect(screen.getAllByLabelText(/Visit our X \(Twitter\)/)).toHaveLength(
        2
      );
      expect(screen.getAllByLabelText(/Visit our GitHub/)).toHaveLength(2);
      expect(screen.getAllByLabelText(/Visit our Discord/)).toHaveLength(2);
      expect(screen.getAllByLabelText(/Visit our Farcaster/)).toHaveLength(2);
      expect(screen.getAllByLabelText(/Visit our Telegram/)).toHaveLength(2);
    });
  });

  describe("Responsive Layout", () => {
    it("should have mobile and desktop layouts", () => {
      const { container } = render(<Footer />);

      // Mobile layout (visible on small screens)
      const mobileLayout = container.querySelector(
        ".flex.flex-col.items-center.gap-4.md\\:hidden"
      );
      expect(mobileLayout).toBeInTheDocument();

      // Desktop layout (hidden on small, visible on md+)
      const desktopLayout = container.querySelector(".hidden.md\\:flex");
      expect(desktopLayout).toBeInTheDocument();
    });
  });
});
