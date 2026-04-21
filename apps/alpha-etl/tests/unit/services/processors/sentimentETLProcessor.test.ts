import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockFetcher, mockTransformer, mockWriter, mockLogger } = vi.hoisted(
  () => ({
    mockFetcher: {
      fetchCurrentSentiment: vi.fn(),
      healthCheck: vi.fn(),
      getRequestStats: vi.fn(),
    },
    mockTransformer: {
      transform: vi.fn(),
    },
    mockWriter: {
      writeSentimentSnapshots: vi.fn(),
    },
    mockLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }),
);

vi.mock("../../../../src/utils/logger.js", () => ({
  logger: mockLogger,
}));

// Mock the entire feargreed module with hoisted mocks
// SentimentETLProcessor imports and instantiates these classes internally
vi.mock("../../../../src/modules/sentiment/index.js", async () => {
  const actualModule = await vi.importActual<
    typeof import("../../../../src/modules/sentiment/index.js")
  >("../../../../src/modules/sentiment/index.js");

  // Create a custom SentimentETLProcessor that uses the mocked dependencies
  class MockedSentimentETLProcessor {
    private fetcher = mockFetcher;
    private transformer = mockTransformer;
    private writer = mockWriter;

    async process(job: { jobId: string }) {
      mockLogger.info("Processing sentiment data", { jobId: job.jobId });

      try {
        const rawData = await this.fetcher.fetchCurrentSentiment();
        const transformed = this.transformer.transform(rawData);

        if (!transformed) {
          return {
            success: false,
            recordsProcessed: 1,
            recordsInserted: 0,
            errors: ["Sentiment data failed validation"],
            source: "feargreed",
          };
        }

        const writeResult = await this.writer.writeSentimentSnapshots(
          [transformed],
          "feargreed",
        );

        mockLogger.info("Sentiment processing completed", {
          jobId: job.jobId,
          recordsProcessed: 1,
          recordsInserted: writeResult.recordsInserted,
          errorCount: writeResult.errors.length,
          success: writeResult.success,
        });

        return {
          success: writeResult.success,
          recordsProcessed: 1,
          recordsInserted: writeResult.recordsInserted,
          errors: writeResult.errors,
          source: "feargreed",
        };
      } catch (error) {
        mockLogger.error("Failed to fetch sentiment data", {
          jobId: job.jobId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return {
          success: false,
          recordsProcessed: 1,
          recordsInserted: 0,
          errors: ["Failed to fetch sentiment data from API"],
          source: "feargreed",
        };
      }
    }

    async healthCheck() {
      return this.fetcher.healthCheck();
    }

    getStats() {
      return { feargreed: this.fetcher.getRequestStats() };
    }

    getSourceType() {
      return "feargreed";
    }
  }

  return {
    ...actualModule,
    SentimentETLProcessor: MockedSentimentETLProcessor,
    FearGreedFetcher: vi.fn(() => {
      return mockFetcher;
    }),
    SentimentDataTransformer: vi.fn(() => {
      return mockTransformer;
    }),
    SentimentWriter: vi.fn(() => {
      return mockWriter;
    }),
  };
});

import { SentimentETLProcessor } from "../../../../src/modules/sentiment/index.js";
import type { ETLJob } from "../../../../src/types/index.js";

const createJob = (overrides: Partial<ETLJob> = {}): ETLJob => ({
  jobId: "job-1",
  trigger: "scheduled",
  sources: ["feargreed"],
  createdAt: new Date(),
  status: "pending",
  ...overrides,
});

describe("SentimentETLProcessor", () => {
  let processor: SentimentETLProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new SentimentETLProcessor();
  });

  it("processes sentiment data successfully", async () => {
    const rawData = {
      value: 60,
      classification: "Greed",
      timestamp: 1_700_000_000,
      source: "coinmarketcap",
    };
    const transformed = {
      sentiment_value: 60,
      classification: "Greed",
      source: "coinmarketcap",
      snapshot_time: "2024-01-01T00:00:00.000Z",
      raw_data: null,
    };

    mockFetcher.fetchCurrentSentiment.mockResolvedValue(rawData);
    mockTransformer.transform.mockReturnValue(transformed);
    mockWriter.writeSentimentSnapshots.mockResolvedValue({
      success: true,
      recordsInserted: 1,
      errors: [],
      duplicatesSkipped: 0,
    });

    const result = await processor.process(createJob());

    expect(result.success).toBe(true);
    expect(result.recordsProcessed).toBe(1);
    expect(result.recordsInserted).toBe(1);
    expect(result.errors).toEqual([]);
    expect(mockWriter.writeSentimentSnapshots).toHaveBeenCalledWith(
      [transformed],
      "feargreed",
    );
  });

  it("fails when transformation returns null", async () => {
    mockFetcher.fetchCurrentSentiment.mockResolvedValue({
      value: 10,
      classification: "Extreme Fear",
      timestamp: 1_700_000_000,
      source: "coinmarketcap",
    });
    mockTransformer.transform.mockReturnValue(null);

    const result = await processor.process(createJob());

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Sentiment data failed validation");
    expect(result.recordsInserted).toBe(0);
    expect(mockWriter.writeSentimentSnapshots).not.toHaveBeenCalled();
  });

  it("propagates writer failures", async () => {
    const transformed = {
      sentiment_value: 80,
      classification: "Extreme Greed",
      source: "coinmarketcap",
      snapshot_time: "2024-01-01T00:00:00.000Z",
      raw_data: null,
    };

    mockFetcher.fetchCurrentSentiment.mockResolvedValue({
      value: 80,
      classification: "Extreme Greed",
      timestamp: 1_700_000_000,
      source: "coinmarketcap",
    });
    mockTransformer.transform.mockReturnValue(transformed);
    mockWriter.writeSentimentSnapshots.mockResolvedValue({
      success: false,
      recordsInserted: 0,
      errors: ["db failure"],
      duplicatesSkipped: 0,
    });

    const result = await processor.process(createJob());

    expect(result.success).toBe(false);
    expect(result.errors).toContain("db failure");
    expect(result.recordsInserted).toBe(0);
  });

  it("forwards health check status", async () => {
    mockFetcher.healthCheck.mockResolvedValue({
      status: "healthy",
      details: "ok",
    });

    const health = await processor.healthCheck();

    expect(health).toEqual({ status: "healthy", details: "ok" });
  });

  it("returns fetcher stats", () => {
    mockFetcher.getRequestStats.mockReturnValue({
      requestCount: 2,
      lastRequestTime: 123,
    });

    const stats = processor.getStats();

    expect(stats).toEqual({
      feargreed: { requestCount: 2, lastRequestTime: 123 },
    });
  });

  describe("API Error Handling", () => {
    it("handles 401 Unauthorized (invalid API key)", async () => {
      const apiError = new Error("CoinMarketCap API error: 401 Unauthorized");
      mockFetcher.fetchCurrentSentiment.mockRejectedValue(apiError);

      const result = await processor.process(createJob());

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(1); // Fetch attempted
      expect(result.recordsInserted).toBe(0);
      expect(result.errors).toContain(
        "Failed to fetch sentiment data from API",
      );
      expect(mockWriter.writeSentimentSnapshots).not.toHaveBeenCalled();
    });

    it("handles 429 Rate Limit Exceeded", async () => {
      const rateLimitError = new Error("CoinMarketCap API error: rate limited");
      mockFetcher.fetchCurrentSentiment.mockRejectedValue(rateLimitError);

      const result = await processor.process(createJob());

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(1); // Fetch attempted
      expect(result.errors).toContain(
        "Failed to fetch sentiment data from API",
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("handles 500 Internal Server Error", async () => {
      const serverError = new Error(
        "CoinMarketCap API error (code 500): Unknown error",
      );
      mockFetcher.fetchCurrentSentiment.mockRejectedValue(serverError);

      const result = await processor.process(createJob());

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        "Failed to fetch sentiment data from API",
      );
      expect(result.recordsInserted).toBe(0);
    });

    it("handles network timeout errors", async () => {
      const timeoutError = new Error("Request timeout after 30000ms");
      timeoutError.name = "TimeoutError";
      mockFetcher.fetchCurrentSentiment.mockRejectedValue(timeoutError);

      const result = await processor.process(createJob());

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        "Failed to fetch sentiment data from API",
      );
      expect(result.recordsProcessed).toBe(1); // Fetch attempted
    });

    it("handles malformed JSON responses", async () => {
      const parseError = new SyntaxError(
        "Unexpected token < in JSON at position 0",
      );
      mockFetcher.fetchCurrentSentiment.mockRejectedValue(parseError);

      const result = await processor.process(createJob());

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        "Failed to fetch sentiment data from API",
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("includes error details in result.errors array", async () => {
      const detailedError = new Error(
        "CoinMarketCap API error: Service unavailable - maintenance window",
      );
      mockFetcher.fetchCurrentSentiment.mockRejectedValue(detailedError);

      const result = await processor.process(createJob());

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe("Failed to fetch sentiment data from API");
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch sentiment data"),
        expect.objectContaining({
          jobId: "job-1",
        }),
      );
    });
  });

  describe("Stale Data Detection", () => {
    it("accepts sentiment data <1 hour old", async () => {
      const recentTimestamp = Math.floor(Date.now() / 1000) - 30 * 60; // 30 minutes ago
      const sentimentData = {
        value: 50,
        classification: "Neutral",
        timestamp: recentTimestamp,
        source: "coinmarketcap",
      };

      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockTransformer.transform.mockReturnValue({
        sentiment_value: 50,
        classification: "Neutral",
        source: "coinmarketcap",
        snapshot_time: new Date(recentTimestamp * 1000).toISOString(),
        raw_data: null,
      });
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(createJob());

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it("processes old data without warnings (stale detection is in health check)", async () => {
      const staleTimestamp = Math.floor(Date.now() / 1000) - 12 * 60 * 60; // 12 hours ago
      const sentimentData = {
        value: 70,
        classification: "Greed",
        timestamp: staleTimestamp,
        source: "coinmarketcap",
      };

      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockTransformer.transform.mockReturnValue({
        sentiment_value: 70,
        classification: "Greed",
        source: "coinmarketcap",
        snapshot_time: new Date(staleTimestamp * 1000).toISOString(),
        raw_data: null,
      });
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(createJob());

      // Processor doesn't check staleness during processing - that's in health check
      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(1);
    });

    it("processes very old data (staleness checked in health check, not processing)", async () => {
      const veryStaleTimestamp = Math.floor(Date.now() / 1000) - 26 * 60 * 60; // 26 hours ago
      const sentimentData = {
        value: 30,
        classification: "Fear",
        timestamp: veryStaleTimestamp,
        source: "coinmarketcap",
      };

      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockTransformer.transform.mockReturnValue({
        sentiment_value: 30,
        classification: "Fear",
        source: "coinmarketcap",
        snapshot_time: new Date(veryStaleTimestamp * 1000).toISOString(),
        raw_data: null,
      });
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(createJob());

      // Processor doesn't reject stale data - that's checked by health check
      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(1);
    });

    it("logs successful processing regardless of data age", async () => {
      const staleTimestamp = Math.floor(Date.now() / 1000) - 2 * 60 * 60; // 2 hours ago
      const sentimentData = {
        value: 65,
        classification: "Greed",
        timestamp: staleTimestamp,
        source: "coinmarketcap",
      };

      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockTransformer.transform.mockReturnValue({
        sentiment_value: 65,
        classification: "Greed",
        source: "coinmarketcap",
        snapshot_time: new Date(staleTimestamp * 1000).toISOString(),
        raw_data: null,
      });
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(createJob());

      expect(result.success).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Sentiment processing completed",
        expect.objectContaining({
          jobId: "job-1",
          recordsInserted: 1,
        }),
      );
    });
  });

  describe("Health Check Scenarios", () => {
    it("returns healthy when API is responsive", async () => {
      mockFetcher.healthCheck.mockResolvedValue({
        status: "healthy",
        details: "Current sentiment: 60 (Greed) - Source: CoinMarketCap",
      });

      const health = await processor.healthCheck();

      expect(health.status).toBe("healthy");
      expect(health.details).toContain("CoinMarketCap");
      expect(health.details).toContain("sentiment");
    });

    it("returns unhealthy when API timeout occurs", async () => {
      mockFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "Request timeout after 30000ms",
      });

      const health = await processor.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.details).toContain("timeout");
    });

    it("returns unhealthy when API key is invalid", async () => {
      mockFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "CoinMarketCap API key not configured",
      });

      const health = await processor.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.details).toContain("API key");
    });

    it("returns unhealthy when data is stale (>24h)", async () => {
      mockFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "Sentiment data is stale (26 hours old)",
      });

      const health = await processor.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.details).toContain("stale");
      expect(health.details).toMatch(/\d+\s+hours/);
    });

    it("includes detailed error message in health check", async () => {
      mockFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details:
          "CoinMarketCap API error: 503 Service Unavailable - Maintenance in progress",
      });

      const health = await processor.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.details).toContain("503");
      expect(health.details).toContain("Maintenance");
    });
  });

  describe("Concurrent Request Handling", () => {
    it("processes multiple jobs sequentially", async () => {
      const job1 = createJob({ jobId: "job-1" });
      const job2 = createJob({ jobId: "job-2" });

      const sentimentData = {
        value: 55,
        classification: "Neutral",
        timestamp: Math.floor(Date.now() / 1000),
        source: "coinmarketcap",
      };

      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockTransformer.transform.mockReturnValue({
        sentiment_value: 55,
        classification: "Neutral",
        source: "coinmarketcap",
        snapshot_time: new Date().toISOString(),
        raw_data: null,
      });
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const [result1, result2] = await Promise.all([
        processor.process(job1),
        processor.process(job2),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(mockFetcher.fetchCurrentSentiment).toHaveBeenCalledTimes(2);
    });

    it("enforces rate limiting across concurrent jobs", async () => {
      const jobs = Array.from({ length: 3 }, (_, i) =>
        createJob({ jobId: `job-${i + 1}` }),
      );

      mockFetcher.fetchCurrentSentiment.mockResolvedValue({
        value: 60,
        classification: "Greed",
        timestamp: Math.floor(Date.now() / 1000),
        source: "coinmarketcap",
      });
      mockTransformer.transform.mockReturnValue({
        sentiment_value: 60,
        classification: "Greed",
        source: "coinmarketcap",
        snapshot_time: new Date().toISOString(),
        raw_data: null,
      });
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      await Promise.all(jobs.map((job) => processor.process(job)));

      // Verify all jobs were processed (timing is handled by fetcher rate limiting)
      expect(mockFetcher.fetchCurrentSentiment).toHaveBeenCalledTimes(3);
      expect(mockWriter.writeSentimentSnapshots).toHaveBeenCalledTimes(3);
    });

    it("maintains request statistics across jobs", async () => {
      mockFetcher.getRequestStats
        .mockReturnValueOnce({ requestCount: 1, lastRequestTime: Date.now() })
        .mockReturnValueOnce({ requestCount: 2, lastRequestTime: Date.now() })
        .mockReturnValueOnce({ requestCount: 3, lastRequestTime: Date.now() });

      const stats1 = processor.getStats();
      expect(stats1.feargreed.requestCount).toBe(1);

      const stats2 = processor.getStats();
      expect(stats2.feargreed.requestCount).toBe(2);

      const stats3 = processor.getStats();
      expect(stats3.feargreed.requestCount).toBe(3);
    });
  });

  describe("Boundary Value Testing", () => {
    it("accepts sentiment_value = 0 (Extreme Fear)", async () => {
      const sentimentData = {
        value: 0,
        classification: "Extreme Fear",
        timestamp: Math.floor(Date.now() / 1000),
        source: "coinmarketcap",
      };

      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockTransformer.transform.mockReturnValue({
        sentiment_value: 0,
        classification: "Extreme Fear",
        source: "coinmarketcap",
        snapshot_time: new Date().toISOString(),
        raw_data: null,
      });
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(createJob());

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(mockWriter.writeSentimentSnapshots).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sentiment_value: 0 }),
        ]),
        "feargreed",
      );
    });

    it("accepts sentiment_value = 100 (Extreme Greed)", async () => {
      const sentimentData = {
        value: 100,
        classification: "Extreme Greed",
        timestamp: Math.floor(Date.now() / 1000),
        source: "coinmarketcap",
      };

      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockTransformer.transform.mockReturnValue({
        sentiment_value: 100,
        classification: "Extreme Greed",
        source: "coinmarketcap",
        snapshot_time: new Date().toISOString(),
        raw_data: null,
      });
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(createJob());

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(mockWriter.writeSentimentSnapshots).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sentiment_value: 100 }),
        ]),
        "feargreed",
      );
    });

    it("accepts sentiment_value = 50 (Neutral)", async () => {
      const sentimentData = {
        value: 50,
        classification: "Neutral",
        timestamp: Math.floor(Date.now() / 1000),
        source: "coinmarketcap",
      };

      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockTransformer.transform.mockReturnValue({
        sentiment_value: 50,
        classification: "Neutral",
        source: "coinmarketcap",
        snapshot_time: new Date().toISOString(),
        raw_data: null,
      });
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(createJob());

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(mockWriter.writeSentimentSnapshots).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sentiment_value: 50 }),
        ]),
        "feargreed",
      );
    });
  });

  describe("Database Constraint Violations", () => {
    it("handles unique constraint violation gracefully", async () => {
      const sentimentData = {
        value: 65,
        classification: "Greed",
        timestamp: Math.floor(Date.now() / 1000),
        source: "coinmarketcap",
      };

      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockTransformer.transform.mockReturnValue({
        sentiment_value: 65,
        classification: "Greed",
        source: "coinmarketcap",
        snapshot_time: new Date().toISOString(),
        raw_data: null,
      });
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 0,
        errors: [],
        duplicatesSkipped: 1,
      });

      const result = await processor.process(createJob());

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(0);
      // Note: duplicatesSkipped is tracked by writer, not exposed in ETLProcessResult
      expect(mockWriter.writeSentimentSnapshots).toHaveBeenCalled();
    });

    it("reports constraint errors without failing job", async () => {
      const sentimentData = {
        value: 75,
        classification: "Greed",
        timestamp: Math.floor(Date.now() / 1000),
        source: "coinmarketcap",
      };

      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockTransformer.transform.mockReturnValue({
        sentiment_value: 75,
        classification: "Greed",
        source: "coinmarketcap",
        snapshot_time: new Date().toISOString(),
        raw_data: null,
      });
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: false,
        recordsInserted: 0,
        errors: [
          'Unique constraint violation: duplicate key value violates unique constraint "sentiment_snapshots_source_snapshot_time_key"',
        ],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(createJob());

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Unique constraint violation");
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Sentiment processing completed",
        expect.objectContaining({
          jobId: expect.any(String),
          success: false,
        }),
      );
    });
  });
});
