import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TokenIconStack } from "@/components/wallet/portfolio/components/shared/TokenIconStack";

describe("TokenIconStack", () => {
  it("renders all icons with symbol text when count <= maxVisible", () => {
    const tokens = [{ symbol: "ETH" }, { symbol: "USDC" }];

    render(<TokenIconStack tokens={tokens} maxVisible={3} />);

    // Check icons rendered
    expect(screen.getAllByRole("img")).toHaveLength(2);

    // Check symbol text displayed next to icons
    expect(screen.getByText("ETH")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();

    // No overflow indicator
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });

  it("shows +N more indicator when count > maxVisible", () => {
    const tokens = [
      { symbol: "ETH" },
      { symbol: "USDC" },
      { symbol: "DAI" },
      { symbol: "USDT" },
    ];

    render(<TokenIconStack tokens={tokens} maxVisible={3} />);

    // First 3 tokens with icons + text
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByText("ETH")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
    expect(screen.getByText("DAI")).toBeInTheDocument();

    // 4th token not shown individually
    expect(screen.queryByText("USDT")).not.toBeInTheDocument();

    // "+1 more" indicator shown
    expect(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it("defaults to maxVisible=3 when not specified", () => {
    const tokens = [
      { symbol: "ETH" },
      { symbol: "USDC" },
      { symbol: "DAI" },
      { symbol: "USDT" },
      { symbol: "WBTC" },
    ];

    render(<TokenIconStack tokens={tokens} />);

    expect(screen.getAllByRole("img")).toHaveLength(3); // Default maxVisible
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("renders empty when token list is empty", () => {
    const tokens: { symbol: string }[] = [];

    render(<TokenIconStack tokens={tokens} maxVisible={3} />);

    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });

  it("renders single token without +N more indicator", () => {
    const tokens = [{ symbol: "ETH" }];

    render(<TokenIconStack tokens={tokens} maxVisible={3} />);

    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument();
  });

  it("uses correct CDN URLs for token icons", () => {
    const tokens = [{ symbol: "ETH" }, { symbol: "USDC" }];

    render(<TokenIconStack tokens={tokens} maxVisible={3} />);

    const images = screen.getAllByRole("img");
    expect(images[0]).toHaveAttribute(
      "src",
      "https://zap-assets-worker.davidtnfsh.workers.dev/tokenPictures/eth.webp"
    );
    expect(images[1]).toHaveAttribute(
      "src",
      "https://zap-assets-worker.davidtnfsh.workers.dev/tokenPictures/usdc.webp"
    );
  });

  it("lowercases token symbols in CDN URLs", () => {
    const tokens = [{ symbol: "WBTC" }];

    render(<TokenIconStack tokens={tokens} maxVisible={3} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", expect.stringContaining("wbtc.webp"));
  });

  it("displays icon and text with correct spacing", () => {
    const tokens = [{ symbol: "ETH" }];

    render(<TokenIconStack tokens={tokens} maxVisible={3} />);

    const textElement = screen.getByText("ETH");
    const container = textElement.closest("div");

    // Check gap-1 spacing between icon and text
    expect(container).toHaveClass("gap-1");
    expect(container).toHaveClass("flex");
    expect(container).toHaveClass("items-center");
  });

  it("handles very long token symbol with wrapping", () => {
    const tokens = [
      { symbol: "SUPERLONGTOKENNAME123456789" },
      { symbol: "ETH" },
    ];

    render(<TokenIconStack tokens={tokens} maxVisible={3} />);

    const container = screen
      .getByText("SUPERLONGTOKENNAME123456789")
      .closest("div");

    // Check flex-wrap is active for wrapping
    expect(container?.parentElement).toHaveClass("flex-wrap");

    // Both tokens should render
    expect(screen.getByText("SUPERLONGTOKENNAME123456789")).toBeInTheDocument();
    expect(screen.getByText("ETH")).toBeInTheDocument();
  });

  it("uses correct CDN URLs for token icons", () => {
    const tokens = [{ symbol: "ETH" }, { symbol: "USDC" }];

    render(<TokenIconStack tokens={tokens} maxVisible={3} />);

    const images = screen.getAllByRole("img");
    expect(images[0]).toHaveAttribute(
      "src",
      "https://zap-assets-worker.davidtnfsh.workers.dev/tokenPictures/eth.webp"
    );
    expect(images[1]).toHaveAttribute(
      "src",
      "https://zap-assets-worker.davidtnfsh.workers.dev/tokenPictures/usdc.webp"
    );
  });

  it("lowercases token symbols in CDN URLs", () => {
    const tokens = [{ symbol: "WBTC" }];

    render(<TokenIconStack tokens={tokens} maxVisible={3} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", expect.stringContaining("wbtc.webp"));
  });
});
