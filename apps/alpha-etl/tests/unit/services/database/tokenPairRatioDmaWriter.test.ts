import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenPairRatioDmaWriter } from "../../../../src/modules/token-price/ratioDmaWriter.js";

describe("TokenPairRatioDmaWriter", () => {
  let writer: TokenPairRatioDmaWriter;
  let mockClient: { query: ReturnType<typeof vi.fn> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let withDatabaseClientSpy: any;

  const snapshot = {
    base_token_symbol: "ETH",
    base_token_id: "ethereum",
    quote_token_symbol: "BTC",
    quote_token_id: "bitcoin",
    snapshot_date: "2026-02-08",
    ratio_value: 0.0325,
    dma_200: 0.028,
    ratio_vs_dma_ratio: 1.160714,
    is_above_dma: true,
    days_available: 200,
    source: "coingecko",
    snapshot_time: "2026-02-08T00:00:00.000Z",
  };

  beforeEach(() => {
    mockClient = { query: vi.fn() };
    writer = new TokenPairRatioDmaWriter();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withDatabaseClientSpy = vi.spyOn(writer as any, "withDatabaseClient");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withDatabaseClientSpy.mockImplementation(async (fn: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (fn as (client: any) => Promise<any>)(mockClient);
    });
  });

  it("should upsert pair ratio DMA rows on conflict", async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ id: "row-1" }],
      rowCount: 1,
    });

    await writer.writeRatioDmaSnapshots([snapshot]);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "ON CONFLICT (source, base_token_symbol, quote_token_symbol, snapshot_date)",
      ),
      expect.any(Array),
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("ratio_value = EXCLUDED.ratio_value"),
      expect.any(Array),
    );
  });

  it("should track inserted records from rowCount", async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ id: "row-1" }],
      rowCount: 1,
    });

    const result = await writer.writeRatioDmaSnapshots([snapshot]);

    expect(result.recordsInserted).toBe(1);
  });

  it("should return an unsuccessful result when the insert fails", async () => {
    mockClient.query.mockRejectedValue(new Error("Insert failed"));

    const result = await writer.writeRatioDmaSnapshots([snapshot]);

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Insert failed");
  });
});
