import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IconBadge } from "@/components/wallet/portfolio/components/shared/IconBadge";

describe("IconBadge", () => {
  it("renders image when CDN source loads successfully", async () => {
    render(
      <IconBadge
        src="https://cdn.com/eth.webp"
        alt="ETH"
        fallback={{ type: "letter", content: "ETH" }}
      />
    );

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://cdn.com/eth.webp");
    expect(img).toHaveAttribute("alt", "ETH");
  });

  it("shows letter badge fallback on image error", async () => {
    render(
      <IconBadge
        src="https://cdn.com/missing.webp"
        alt="UNKNOWN"
        fallback={{ type: "letter", content: "UNKNOWN" }}
      />
    );

    // Simulate image load error
    const img = screen.getByRole("img");
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByText("U")).toBeInTheDocument(); // First letter fallback
    });
  });

  it("applies correct size classes for sm/md variants", () => {
    const { rerender } = render(
      <IconBadge
        src="test.webp"
        alt="Test"
        size="sm"
        fallback={{ type: "letter", content: "T" }}
      />
    );
    const container = screen.getByRole("img").closest("div");
    expect(container).toHaveClass("w-5");
    expect(container).toHaveClass("h-5");

    rerender(
      <IconBadge
        src="test.webp"
        alt="Test"
        size="md"
        fallback={{ type: "letter", content: "T" }}
      />
    );
    const containerMd = screen.getByRole("img").closest("div");
    expect(containerMd).toHaveClass("w-6");
    expect(containerMd).toHaveClass("h-6");
  });

  it("displays fallback text when type is text", async () => {
    render(
      <IconBadge
        src="https://cdn.com/missing.webp"
        alt="UNKNOWN"
        fallback={{ type: "text", content: "N/A" }}
      />
    );

    const img = screen.getByRole("img");
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByText("N/A")).toBeInTheDocument();
    });
  });

  it("uppercases first letter for letter fallback", async () => {
    render(
      <IconBadge
        src="https://cdn.com/missing.webp"
        alt="eth"
        fallback={{ type: "letter", content: "eth" }}
      />
    );

    const img = screen.getByRole("img");
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByText("E")).toBeInTheDocument(); // Uppercase first letter
    });
  });

  it("triggers onLoad callback and sets image status to success", async () => {
    render(
      <IconBadge
        src="https://cdn.com/eth.webp"
        alt="ETH"
        fallback={{ type: "letter", content: "ETH" }}
      />
    );

    const img = screen.getByRole("img");
    fireEvent.load(img);

    // After onLoad fires, image remains visible (no error fallback shown)
    await waitFor(() => {
      expect(screen.getByRole("img")).toBeInTheDocument();
      expect(screen.queryByText("E")).not.toBeInTheDocument();
    });
  });

  it("shows '?' when fallback letter content is empty", async () => {
    render(
      <IconBadge
        src="https://cdn.com/missing.webp"
        alt="unknown"
        fallback={{ type: "letter", content: "" }}
      />
    );

    const img = screen.getByRole("img");
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByText("?")).toBeInTheDocument();
    });
  });
});
