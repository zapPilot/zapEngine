import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenPriceDmaWriter } from "../../../../src/modules/token-price/dmaWriter.js";

// Mock DB client
const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
  query: vi.fn(),
  on: vi.fn(),
};

// Mock pg
vi.mock("pg", () => ({
  Pool: vi.fn().mockImplementation(() => {
    return mockPool;
  }),
}));

// Mock logger
vi.mock("../../../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../../../setup/mocks.js");
  return mockLogger();
});

describe("TokenPriceDmaWriter", () => {
  let writer: TokenPriceDmaWriter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let withDatabaseClientSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    writer = new TokenPriceDmaWriter();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withDatabaseClientSpy = vi.spyOn(writer as any, "withDatabaseClient");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withDatabaseClientSpy.mockImplementation(async (fn: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (fn as (client: any) => Promise<any>)(mockClient);
    });
  });

  it("should handle successful DMA batch write", async () => {
    const snapshots: unknown[] = [
      {
        source: "coingecko",
        token_symbol: "BTC",
        snapshot_date: "2024-01-01",
        snapshot_time: new Date().toISOString(),
        price_usd: 50000,
        dma_200: 45000,
        price_vs_dma_ratio: 1.11,
        is_above_dma: true,
        days_available: 200,
      },
    ];

    mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] });

    const result = await writer.writeDmaSnapshots(snapshots);

    expect(result.success).toBe(true);
    expect(result.recordsInserted).toBe(1);
    expect(mockClient.query).toHaveBeenCalled();
  });

  it("should handle null rowCount from query result", async () => {
    const snapshots: unknown[] = [
      {
        source: "coingecko",
        token_symbol: "BTC",
        snapshot_date: "2024-01-01",
        snapshot_time: new Date().toISOString(),
        price_usd: 50000,
        dma_200: 45000,
        price_vs_dma_ratio: 1.11,
        is_above_dma: true,
        days_available: 200,
      },
    ];

    // Return null rowCount — triggers the ?? 0 fallback
    mockClient.query.mockResolvedValueOnce({
      rowCount: null,
      rows: [{ id: 1 }],
    });

    const result = await writer.writeDmaSnapshots(snapshots);

    expect(result.success).toBe(true);
    // executeBatchWrite uses rowCount ?? 0, so null rowCount = 0
    expect(result.recordsInserted).toBe(0);
  });

  it("should handle undefined rowCount and empty rows", async () => {
    const snapshots: unknown[] = [
      {
        source: "coingecko",
        token_symbol: "BTC",
        snapshot_date: "2024-01-01",
        snapshot_time: new Date().toISOString(),
        price_usd: 50000,
        dma_200: null,
        price_vs_dma_ratio: null,
        is_above_dma: null,
        days_available: 50,
      },
    ];

    // Both null — triggers the ?? 0 final fallback
    mockClient.query.mockResolvedValueOnce({
      rowCount: undefined,
      rows: undefined,
    });

    const result = await writer.writeDmaSnapshots(snapshots);

    expect(result.success).toBe(true);
    expect(result.recordsInserted).toBe(0);
  });

  it("should return empty result for empty batch", async () => {
    const result = await writer.writeDmaSnapshots([]);

    expect(result.success).toBe(true);
    expect(result.recordsInserted).toBe(0);
    expect(result.errors).toHaveLength(0);
    // No query should have been executed
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("should handle db error during DMA write", async () => {
    const snapshots: unknown[] = [
      {
        source: "coingecko",
        token_symbol: "BTC",
        snapshot_date: "2024-01-01",
        snapshot_time: new Date().toISOString(),
        price_usd: 50000,
        dma_200: 45000,
        price_vs_dma_ratio: 1.11,
        is_above_dma: true,
        days_available: 200,
      },
    ];

    mockClient.query.mockRejectedValueOnce(new Error("DMA write failed"));

    const result = await writer.writeDmaSnapshots(snapshots);

    expect(result.success).toBe(false);
    expect(result.errors).toContain("DMA write failed");
  });
});
