import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger as mockLogger } from "../../../../src/utils/logger.js";

const mocks = vi.hoisted(() => ({
  fetcher: {
    fetchCurrentPrice: vi.fn(),
    fetchHistoricalPrice: vi.fn(),
    formatDateForApi: vi.fn((d: Date) => d.toISOString().split("T")[0]),
    healthCheck: vi.fn(),
    getRequestStats: vi.fn(() => ({})),
  },
  writer: {
    insertSnapshot: vi.fn(),
    getExistingDatesInRange: vi.fn(),
    getLatestSnapshot: vi.fn(),
    getSnapshotCount: vi.fn(),
    insertBatch: vi.fn(),
  },
  dmaService: {
    updateDmaForToken: vi.fn(),
    updateEthBtcRatioDma: vi.fn(),
    getLatestDmaSnapshot: vi.fn(),
  },
}));

vi.mock("../../../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../../../setup/mocks.js");
  return mockLogger();
});

vi.mock("../../../../src/modules/token-price/fetcher.js", () => ({
  CoinGeckoFetcher: class {
    constructor() {
      return mocks.fetcher;
    }
  },
}));

vi.mock("../../../../src/modules/token-price/writer.js", () => ({
  TokenPriceWriter: class {
    constructor() {
      return mocks.writer;
    }
  },
}));

vi.mock("../../../../src/modules/token-price/dmaService.js", () => ({
  TokenPriceDmaService: class {
    constructor() {
      return mocks.dmaService;
    }
  },
}));

vi.mock("../../../../src/config/database.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../src/config/database.js")>();
  return {
    ...actual,
    getDbPool: vi.fn(() => ({}) as unknown),
  };
});

import { TokenPriceETLProcessor } from "../../../../src/modules/token-price/processor.js";

describe("TokenPriceETLProcessor error paths", () => {
  let processor: TokenPriceETLProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new TokenPriceETLProcessor({} as unknown);
  });

  describe("healthCheck", () => {
    it("should return unhealthy on exception", async () => {
      mocks.fetcher.healthCheck.mockRejectedValueOnce(new Error("health boom"));

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toBe("health boom");
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Health check failed",
        expect.objectContaining({ error: "health boom" }),
      );
    });
  });

  describe("getStats", () => {
    it("should show lastProcessedAt and successRate after a successful process", async () => {
      const job = {
        jobId: "test-1",
        trigger: "manual",
        sources: ["token-price"],
        createdAt: new Date().toISOString(),
        status: "pending",
      };

      mocks.fetcher.fetchCurrentPrice
        .mockResolvedValueOnce({
          priceUsd: 100,
          marketCapUsd: 1000,
          volume24hUsd: 500,
          source: "coingecko",
          tokenSymbol: "BTC",
          tokenId: "bitcoin",
          timestamp: new Date(),
        })
        .mockResolvedValueOnce({
          priceUsd: 2000,
          marketCapUsd: 200000,
          volume24hUsd: 50000,
          source: "coingecko",
          tokenSymbol: "ETH",
          tokenId: "ethereum",
          timestamp: new Date(),
        });
      mocks.writer.insertSnapshot
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      mocks.dmaService.updateDmaForToken
        .mockResolvedValueOnce({
          recordsInserted: 1,
        })
        .mockResolvedValueOnce({
          recordsInserted: 1,
        });
      mocks.dmaService.updateEthBtcRatioDma
        .mockResolvedValueOnce({
          recordsInserted: 1,
        })
        .mockResolvedValueOnce({
          recordsInserted: 1,
        });

      await processor.process(job as unknown);

      const stats = processor.getStats();
      expect(stats.lastProcessedAt).not.toBeNull();
      expect(stats.successRate).toContain("%");
      expect(stats.totalProcessed).toBe(1);
      expect(mocks.dmaService.updateEthBtcRatioDma).toHaveBeenCalledTimes(2);
    });

    it("should show N/A success rate when nothing processed", () => {
      const stats = processor.getStats();
      expect(stats.successRate).toBe("N/A");
      expect(stats.lastProcessedAt).toBeNull();
    });
  });

  describe("backfillHistory error paths", () => {
    it("should fall back to empty dates when gap detection fails", async () => {
      mocks.writer.getExistingDatesInRange.mockRejectedValueOnce(
        new Error("gap error"),
      );
      mocks.fetcher.fetchHistoricalPrice.mockResolvedValue({
        priceUsd: 100,
        marketCapUsd: 1000,
        volume24hUsd: 500,
        source: "coingecko",
        tokenSymbol: "BTC",
        tokenId: "bitcoin",
        timestamp: new Date(),
      });
      mocks.writer.insertBatch.mockResolvedValueOnce(1);

      const result = await processor.backfillHistory(1);

      expect(result.existing).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Gap detection failed, falling back to full fetch",
        expect.objectContaining({ error: "gap error" }),
      );
    });

    it("should log and skip individual date fetch failures", async () => {
      mocks.writer.getExistingDatesInRange.mockResolvedValueOnce([]);
      mocks.fetcher.fetchHistoricalPrice.mockRejectedValueOnce(
        new Error("fetch fail"),
      );
      mocks.writer.insertBatch.mockResolvedValueOnce(0);

      const result = await processor.backfillHistory(1);

      expect(result.fetched).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch missing date",
        expect.objectContaining({ error: "fetch fail" }),
      );
    });
  });

  describe("ETH/BTC ratio refresh", () => {
    it("should refresh ETH/BTC ratio after BTC DMA updates", async () => {
      mocks.dmaService.updateDmaForToken.mockResolvedValueOnce({
        recordsInserted: 1,
      });
      mocks.dmaService.updateEthBtcRatioDma.mockResolvedValueOnce({
        recordsInserted: 1,
      });

      await processor.updateDmaForToken("BTC", "bitcoin", "job-btc");

      expect(mocks.dmaService.updateEthBtcRatioDma).toHaveBeenCalledWith(
        "job-btc",
      );
    });

    it("should skip ETH/BTC ratio refresh for unrelated tokens", async () => {
      mocks.dmaService.updateDmaForToken.mockResolvedValueOnce({
        recordsInserted: 1,
      });

      await processor.updateDmaForToken("SOL", "solana", "job-sol");

      expect(mocks.dmaService.updateEthBtcRatioDma).not.toHaveBeenCalled();
    });
  });
});
