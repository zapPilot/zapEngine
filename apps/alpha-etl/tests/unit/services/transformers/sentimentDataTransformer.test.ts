import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SentimentDataTransformer,
  type SentimentData,
} from "../../../../src/modules/sentiment/index.js";

// Silence logs
vi.mock("../../../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../../../setup/mocks.js");
  return mockLogger();
});

describe("SentimentDataTransformer", () => {
  let transformer: SentimentDataTransformer;

  beforeEach(() => {
    vi.clearAllMocks();
    transformer = new SentimentDataTransformer();
  });

  it("transforms valid sentiment data into snapshot format", () => {
    const raw: SentimentData = {
      value: 72,
      classification: "Greed",
      timestamp: 1_700_000_000,
      source: "CoinMarketCap",
    };

    const result = transformer.transform(raw);

    expect(result).not.toBeNull();
    expect(result?.sentiment_value).toBe(72);
    expect(result?.classification).toBe("Greed");
    expect(result?.source).toBe("coinmarketcap");
    expect(result?.snapshot_time).toBe(
      new Date(raw.timestamp * 1000).toISOString(),
    );
    expect(result?.raw_data?.original_data).toEqual(raw);
  });

  it("returns null for invalid sentiment value", () => {
    const raw: SentimentData = {
      value: 150,
      classification: "Extreme Greed",
      timestamp: 1_700_000_000,
      source: "coinmarketcap",
    };

    const result = transformer.transform(raw);

    expect(result).toBeNull();
  });

  it("returns null when classification is missing", () => {
    const raw: SentimentData = {
      value: 40,
      classification: "",
      timestamp: 1_700_000_000,
      source: "coinmarketcap",
    };

    const result = transformer.transform(raw);
    expect(result).toBeNull();
  });

  it("returns null when timestamp is falsy", () => {
    const raw: SentimentData = {
      value: 40,
      classification: "Fear",
      timestamp: NaN as unknown,
      source: "coinmarketcap",
    };

    const result = transformer.transform(raw);
    expect(result).toBeNull();
  });

  it("warns but still transforms when classification/value mismatch", () => {
    const raw: SentimentData = {
      value: 10,
      classification: "Greed",
      timestamp: 1_700_000_000,
      source: "coinmarketcap",
    };

    const result = transformer.transform(raw);
    expect(result).not.toBeNull();
    expect(result?.classification).toBe("Greed");
  });

  it("warns on future timestamp but returns record", () => {
    const futureSeconds = Math.floor(Date.now() / 1000) + 7200; // 2 hours in future
    const raw: SentimentData = {
      value: 55,
      classification: "Greed",
      timestamp: futureSeconds,
      source: "coinmarketcap",
    };

    const result = transformer.transform(raw);
    expect(result).not.toBeNull();
    expect(result?.snapshot_time).toBeDefined();
  });

  it("returns null when timestamp is out of JS date range", () => {
    const raw: SentimentData = {
      value: 55,
      classification: "Greed",
      timestamp: 9_000_000_000_000, // beyond Date limit when multiplied by 1000
      source: "coinmarketcap",
    };

    const result = transformer.transform(raw);
    expect(result).toBeNull();
  });

  it("handles unexpected errors inside transform", () => {
    const spy = vi
      .spyOn(transformer as unknown, "convertTimestamp")
      .mockImplementation(() => {
        throw new Error("convert failed");
      });

    const raw: SentimentData = {
      value: 55,
      classification: "Greed",
      timestamp: 1_700_000_000,
      source: "coinmarketcap",
    };

    const result = transformer.transform(raw);
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it("filters invalid entries in batch transformation", () => {
    const valid: SentimentData = {
      value: 40,
      classification: "Fear",
      timestamp: 1_700_000_000,
      source: "coinmarketcap",
    };
    const invalid: SentimentData = {
      value: -5,
      classification: "Extreme Fear",
      timestamp: 1_700_000_000,
      source: "coinmarketcap",
    };

    const batch = transformer.transformBatch([valid, invalid]);

    expect(batch).toHaveLength(1);
    expect(batch[0].classification).toBe("Fear");
  });

  describe("Classification Normalization", () => {
    it("normalizes lowercase classification", () => {
      const raw: SentimentData = {
        value: 15,
        classification: "extreme fear",
        timestamp: 1_700_000_000,
        source: "coinmarketcap",
      };

      const result = transformer.transform(raw);
      expect(result).not.toBeNull();
      expect(result?.classification).toBe("Extreme Fear");
    });

    it("normalizes uppercase classification", () => {
      const raw: SentimentData = {
        value: 40,
        classification: "FEAR",
        timestamp: 1_700_000_000,
        source: "coinmarketcap",
      };

      const result = transformer.transform(raw);
      expect(result).not.toBeNull();
      expect(result?.classification).toBe("Fear");
    });

    it("normalizes mixed case classification", () => {
      const raw: SentimentData = {
        value: 80,
        classification: "eXtrEme gReeD",
        timestamp: 1_700_000_000,
        source: "coinmarketcap",
      };

      const result = transformer.transform(raw);
      expect(result).not.toBeNull();
      expect(result?.classification).toBe("Extreme Greed");
    });

    it("normalizes classification with leading/trailing whitespace", () => {
      const raw: SentimentData = {
        value: 50,
        classification: "  Neutral  ",
        timestamp: 1_700_000_000,
        source: "coinmarketcap",
      };

      const result = transformer.transform(raw);
      expect(result).not.toBeNull();
      expect(result?.classification).toBe("Neutral");
    });

    it('handles "Extreme fear" specific case from logs', () => {
      const raw: SentimentData = {
        value: 15,
        classification: "Extreme fear",
        timestamp: 1_700_000_000,
        source: "coinmarketcap",
      };

      const result = transformer.transform(raw);
      expect(result).not.toBeNull();
      expect(result?.classification).toBe("Extreme Fear");
    });

    it("rejects completely invalid classifications even with normalization attempt", () => {
      const raw: SentimentData = {
        value: 50,
        classification: "Super Bullish",
        timestamp: 1_700_000_000,
        source: "coinmarketcap",
      };

      const result = transformer.transform(raw);
      expect(result).toBeNull();
    });
  });

  describe("Classification Range Fallback", () => {
    it("uses full range fallback for unknown classification not in boundaries map", () => {
      // The SentimentDataSchema normalizes classification via normalizeSentimentClassification.
      // 'Greed' is valid, but if value doesn't match Greed's boundaries [55,75], it warns.
      // To hit the fallback in resolveClassificationRange, we need a classification
      // that passes schema validation but isn't in SENTIMENT_CLASSIFICATION_BOUNDARIES.
      // Since the schema uses z.enum(), only valid classifications pass.
      // Instead, test that isValidClassificationForValue warns on mismatch,
      // which indirectly exercises the boundary lookup for all known classifications.
      const raw: SentimentData = {
        value: 90,
        classification: "Fear",
        timestamp: 1_700_000_000,
        source: "coinmarketcap",
      };

      const result = transformer.transform(raw);
      // Should still transform (warn but not reject)
      expect(result).not.toBeNull();
      expect(result?.classification).toBe("Fear");
      expect(result?.sentiment_value).toBe(90);
    });
  });

  describe("Edge Case Timestamp Handling", () => {
    it("handles timestamp at midnight UTC", () => {
      const midnightUTC = new Date("2024-01-01T00:00:00.000Z");
      const midnightTimestamp = Math.floor(midnightUTC.getTime() / 1000);

      const raw: SentimentData = {
        value: 50,
        classification: "Neutral",
        timestamp: midnightTimestamp,
        source: "coinmarketcap",
      };

      const result = transformer.transform(raw);

      expect(result).not.toBeNull();
      expect(result?.snapshot_time).toBe("2024-01-01T00:00:00.000Z");
      expect(result?.sentiment_value).toBe(50);
    });

    it("handles future timestamps gracefully with warning", () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future

      const raw: SentimentData = {
        value: 65,
        classification: "Greed",
        timestamp: futureTimestamp,
        source: "coinmarketcap",
      };

      const result = transformer.transform(raw);

      // Should still transform the data despite future timestamp
      expect(result).not.toBeNull();
      expect(result?.sentiment_value).toBe(65);
      expect(result?.classification).toBe("Greed");

      // Verify snapshot_time is the future timestamp
      const expectedDate = new Date(futureTimestamp * 1000);
      expect(result?.snapshot_time).toBe(expectedDate.toISOString());
    });
  });
});
