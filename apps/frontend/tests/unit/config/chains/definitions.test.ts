import { describe, expect, it } from "vitest";

import { SUPPORTED_CHAINS } from "@/config/chains/definitions";

describe("SUPPORTED_CHAINS", () => {
  it("exports a non-empty array", () => {
    expect(Array.isArray(SUPPORTED_CHAINS)).toBe(true);
    expect(SUPPORTED_CHAINS.length).toBeGreaterThan(0);
  });

  it("every chain has required fields", () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(typeof chain.id).toBe("number");
      expect(typeof chain.name).toBe("string");
      expect(typeof chain.symbol).toBe("string");
      expect(chain.isSupported).toBe(true);
    }
  });

  it("contains Arbitrum One (chain id 42161)", () => {
    const arbitrum = SUPPORTED_CHAINS.find(c => c.id === 42161);
    expect(arbitrum).toBeDefined();
    expect(arbitrum?.name).toBe("Arbitrum One");
    expect(arbitrum?.symbol).toBe("ARB");
  });

  it("contains Base (chain id 8453)", () => {
    const base = SUPPORTED_CHAINS.find(c => c.id === 8453);
    expect(base).toBeDefined();
    expect(base?.name).toBe("Base");
  });

  it("contains Optimism (chain id 10)", () => {
    const optimism = SUPPORTED_CHAINS.find(c => c.id === 10);
    expect(optimism).toBeDefined();
    expect(optimism?.name).toBe("Optimism");
  });

  it("every chain has rpcUrls with at least one http endpoint", () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.rpcUrls.default.http.length).toBeGreaterThan(0);
      expect(chain.rpcUrls.public.http.length).toBeGreaterThan(0);
    }
  });

  it("every chain has blockExplorer and nativeCurrency", () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.blockExplorers.default.url).toBeTruthy();
      expect(chain.nativeCurrency.decimals).toBe(18);
      expect(chain.nativeCurrency.symbol).toBe("ETH");
    }
  });

  it("every chain has metadata with blockTime and layer", () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.metadata.blockTime).toBeGreaterThan(0);
      expect(typeof chain.metadata.layer).toBe("string");
    }
  });

  it("all chains are L2 with Ethereum as parent", () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.metadata.layer).toBe("L2");
      expect(chain.metadata.parentChain).toBe(1);
    }
  });

  it("only includes chains where isSupported is true", () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.isSupported).toBe(true);
    }
  });
});
