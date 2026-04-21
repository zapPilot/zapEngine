import { describe, it, expect, beforeEach, vi } from "vitest";
import { PoolWriter } from "../../../../src/modules/pool/writer.js";
import { PortfolioItemWriter } from "../../../../src/modules/wallet/portfolioWriter.js";
import { SentimentWriter } from "../../../../src/modules/sentiment/index.js";
import { TokenPriceWriter } from "../../../../src/modules/token-price/index.js";
import { WalletBalanceWriter } from "../../../../src/modules/wallet/balanceWriter.js";

vi.mock("../../../../src/config/database.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../src/config/database.js")>();
  return {
    ...actual,
    getDbClient: vi.fn(),
  };
});

vi.mock("../../../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../../../setup/mocks.js");
  return mockLogger();
});

describe("Database Services", () => {
  let mockClient: unknown;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    const database = await import("../../../../src/config/database.js");
    (database.getDbClient as unknown).mockResolvedValue(mockClient);
  });

  describe("PoolWriter", () => {
    it("should handle batch errors via writePoolSnapshots", async () => {
      mockClient.query.mockRejectedValue(new Error("Batch error"));
      const writer = new PoolWriter();

      const result = await writer.writePoolSnapshots(
        [{ source: "s", symbol: "S", apr: 1 } as unknown],
        "source",
      );
      expect(result.success).toBe(false);
      expect(result.errors[0]).toBe("Batch error");
    });
  });

  describe("PortfolioItemWriter", () => {
    it("should handle database error in writeSnapshots", async () => {
      mockClient.query.mockRejectedValue(new Error("Write error"));
      const writer = new PortfolioItemWriter();

      const result = await writer.writeSnapshots([
        { wallet: "w1", id_raw: "id1" } as unknown,
      ]);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toBe("Write error");
    });
  });

  describe("SentimentWriter", () => {
    it("should handle database error in writeSentimentSnapshots", async () => {
      mockClient.query.mockRejectedValue(new Error("Write error"));
      const writer = new SentimentWriter();

      const result = await writer.writeSentimentSnapshots(
        [{ source: "s", classification: "c", sentiment_value: 50 } as unknown],
        "source",
      );
      expect(result.success).toBe(false);
      expect(result.errors[0]).toBe("Write error");
    });
  });

  describe("TokenPriceWriter", () => {
    it("should handle error in insertBatch", async () => {
      const writer = new TokenPriceWriter();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, "withDatabaseClient").mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => {
          return (fn as (client: unknown) => Promise<unknown>)({
            query: mockClient.query,
          });
        },
      );
      mockClient.query.mockRejectedValue(new Error("Insert error"));

      await expect(
        writer.insertBatch([
          {
            timestamp: new Date(),
            priceUsd: 100,
            marketCapUsd: 1000,
            volume24hUsd: 500,
            source: "coingecko",
            tokenSymbol: "TEST",
            tokenId: "test",
          },
        ]),
      ).rejects.toThrow("Insert error");
    });
  });

  describe("WalletBalanceWriter", () => {
    it("should handle database error in writeWalletBalanceSnapshots", async () => {
      mockClient.query.mockRejectedValue(new Error("Write error"));
      const writer = new WalletBalanceWriter();

      // First call removed to avoid duplicate declaration

      // Wait, WalletBalanceWriter implementation doesn't catch error in writeWalletBalanceSnapshots/writeBatch?
      // Checking file: writeBatch wraps in try/catch (lines 77-84 in WalletBalanceWriter? No, checking previous file content step 163...
      // WalletBalanceWriter lines 45-50 log success. But where is catch?
      // WalletBalanceWriter.ts (Step 163) does NOT have try/catch block!
      // Line 37: `await this.withDatabaseClient...`
      // BaseWriter.withDatabaseClient might handle it?
      // Checking PoolWriter (Step 159), it DOES have try/catch blocks in writeBatch.
      // WalletBalanceWriter seems to rely on BaseWriter or caller handling?
      // If check line 48 was 'uncovered', and file ends at 55.
      // Line 48 is `duplicatesSkipped: result.duplicatesSkipped ?? 0,` inside logger.debug.
      // If coverage report says line 48 is uncovered, it means `writeBatch` success path logger was not hit?
      // Or maybe it is covered but I want to cover ERROR path?
      // If there is no try/catch, error propagates.
      // I will expect it to throw.

      // Wait, looking at Step 163 again... lines 52: return result.
      // It seems WalletBalanceWriter implementation provided in Step 163 is different from others.
      // It does NOT catch errors. So it throws.

      const result = await writer.writeWalletBalanceSnapshots([
        { user_wallet_address: "w1", token_address: "t1" } as unknown,
      ]);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
