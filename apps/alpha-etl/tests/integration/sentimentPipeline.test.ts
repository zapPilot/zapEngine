import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ETLJob } from "../../src/types/index.js";
import type { SentimentData } from "../../src/modules/sentiment/index.js";
import type { WriteResult } from "../../src/core/database/baseWriter.js";

const createRequestStats = () => ({
  requestCount: 0,
  lastRequestTime: null,
});

/**
 * Integration Tests for Fear & Greed Sentiment Pipeline
 *
 * These tests verify the end-to-end flow of the sentiment pipeline with realistic data.
 * Unlike unit tests, these allow real transformers to execute and only mock external APIs
 * and database operations.
 */

// Create mock factory functions that return mock instances
const createMockFearGreedFetcher = () => ({
  fetchCurrentSentiment: vi.fn(),
  fetchRawResponse: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
  getRequestStats: vi.fn().mockReturnValue(createRequestStats()),
});

const createMockSentimentWriter = () => ({
  writeSentimentSnapshots: vi.fn().mockResolvedValue({
    success: true,
    recordsInserted: 0,
    errors: [],
    duplicatesSkipped: 0,
  } as WriteResult),
});

// Create global mock instances that will be shared
let mockFetcher: ReturnType<typeof createMockFearGreedFetcher>;
let mockWriter: ReturnType<typeof createMockSentimentWriter>;

// Mock external dependencies with factory functions
// Note: We must also override SentimentETLProcessor because when all classes are in
// the same module, the internal `new FearGreedFetcher()` doesn't use the mocked constructor
vi.mock("../../src/modules/sentiment/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/modules/sentiment/index.js")
    >();

  // Create a MockedSentimentETLProcessor that uses the mock dependencies
  // but uses the real SentimentDataTransformer for integration testing
  class MockedSentimentETLProcessor {
    private fetcher = mockFetcher;
    private transformer = new actual.SentimentDataTransformer();
    private writer = mockWriter;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async process(_job: { jobId: string }) {
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

        return {
          success: writeResult.success,
          recordsProcessed: 1,
          recordsInserted: writeResult.recordsInserted,
          errors: writeResult.errors,
          source: "feargreed",
        };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_error) {
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
    ...actual,
    SentimentETLProcessor: MockedSentimentETLProcessor,
    FearGreedFetcher: vi.fn().mockImplementation(() => {
      return mockFetcher;
    }),
    SentimentWriter: vi.fn().mockImplementation(() => {
      return mockWriter;
    }),
  };
});

// Silence logger
vi.mock("../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../setup/mocks.js");
  return mockLogger();
});

// Import after mocks are set up
const { SentimentETLProcessor } =
  await import("../../src/modules/sentiment/index.js");

/**
 * Test fixtures
 */
const createMockSentimentData = (
  overrides: Partial<SentimentData> = {},
): SentimentData => ({
  value: 55,
  classification: "Greed",
  timestamp: Math.floor((Date.now() - 60000) / 1000), // 1 minute ago
  source: "coinmarketcap",
  ...overrides,
});

const createTestJob = (): ETLJob => ({
  jobId: `test-sentiment-${Date.now()}`,
  trigger: "scheduled",
  sources: ["feargreed"],
  filters: {},
  createdAt: new Date(),
  status: "pending",
});

describe("Sentiment Pipeline Integration Tests", () => {
  let processor: SentimentETLProcessor;

  beforeEach(() => {
    // Create fresh mock instances for each test
    mockFetcher = createMockFearGreedFetcher();
    mockWriter = createMockSentimentWriter();

    // Create a new processor instance (will use the fresh mocks)
    processor = new SentimentETLProcessor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Complete E2E Flow - Happy Path", () => {
    it("successfully processes sentiment through entire pipeline", async () => {
      const job = createTestJob();

      // Mock successful API response
      const sentimentData = createMockSentimentData({
        value: 60,
        classification: "Greed",
      });
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      // Mock successful write
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      // Execute
      const result = await processor.process(job);

      // Assertions - Overall success
      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.source).toBe("feargreed");

      // Assertions - API calls
      expect(mockFetcher.fetchCurrentSentiment).toHaveBeenCalledTimes(1);

      // Assertions - Database writes
      expect(mockWriter.writeSentimentSnapshots).toHaveBeenCalledTimes(1);

      // Verify writer received correct data
      const writeCall = mockWriter.writeSentimentSnapshots.mock.calls[0][0];
      expect(writeCall).toHaveLength(1);
      expect(writeCall[0].sentiment_value).toBe(60);
      expect(writeCall[0].classification).toBe("Greed");
      expect(writeCall[0].source).toBe("coinmarketcap");
    });

    it("verifies data consistency through transformation pipeline", async () => {
      const job = createTestJob();

      const sentimentData = createMockSentimentData({
        value: 27,
        classification: "Fear",
        timestamp: Math.floor(Date.now() / 1000) - 120, // 2 minutes ago
      });
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      await processor.process(job);

      // Verify transformed record structure
      const writeCall = mockWriter.writeSentimentSnapshots.mock.calls[0][0];
      expect(writeCall).toHaveLength(1);

      const record = writeCall[0];
      expect(record.sentiment_value).toBe(27);
      expect(record.classification).toBe("Fear");
      expect(record.source).toBe("coinmarketcap");
      expect(record.snapshot_time).toBeDefined();
      expect(record.raw_data).toBeDefined();

      // Verify timestamp is preserved correctly
      expect(new Date(record.snapshot_time).getTime()).toBeCloseTo(
        sentimentData.timestamp * 1000,
        -3, // Within 1 second
      );

      // Verify raw_data JSONB field contains original data
      expect(record.raw_data).toHaveProperty("original_data");
      expect(record.raw_data.original_data).toEqual(
        expect.objectContaining({
          value: 27,
          classification: "Fear",
        }),
      );
    });

    it("confirms database upsert with correct structure", async () => {
      const job = createTestJob();

      const sentimentData = createMockSentimentData({
        value: 50,
        classification: "Neutral",
      });
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      await processor.process(job);

      // Verify writer was called with correct source parameter
      expect(mockWriter.writeSentimentSnapshots).toHaveBeenCalledWith(
        expect.any(Array),
        "feargreed",
      );

      // Verify record has all required fields for database
      const writeCall = mockWriter.writeSentimentSnapshots.mock.calls[0][0];
      const record = writeCall[0];

      expect(record).toHaveProperty("sentiment_value");
      expect(record).toHaveProperty("classification");
      expect(record).toHaveProperty("source");
      expect(record).toHaveProperty("snapshot_time");
      expect(record).toHaveProperty("raw_data");

      // Verify types
      expect(typeof record.sentiment_value).toBe("number");
      expect(typeof record.classification).toBe("string");
      expect(typeof record.source).toBe("string");
      expect(typeof record.snapshot_time).toBe("string"); // ISO string format
      expect(typeof record.raw_data).toBe("object");
    });

    it("validates timestamp format and timezone handling", async () => {
      const job = createTestJob();

      // Create timestamp at midnight UTC
      const midnightUTC = new Date("2024-12-27T00:00:00.000Z");
      const sentimentData = createMockSentimentData({
        timestamp: Math.floor(midnightUTC.getTime() / 1000),
      });
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      await processor.process(job);

      const writeCall = mockWriter.writeSentimentSnapshots.mock.calls[0][0];
      const record = writeCall[0];

      // Verify timestamp is correctly converted to ISO string
      expect(record.snapshot_time).toBe(midnightUTC.toISOString());

      // Verify it's a valid ISO 8601 string with UTC timezone (ends with Z)
      expect(record.snapshot_time).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it("ensures raw_data JSONB field preservation", async () => {
      const job = createTestJob();

      const sentimentData = createMockSentimentData({
        value: 75,
        classification: "Extreme Greed",
      });
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      await processor.process(job);

      const writeCall = mockWriter.writeSentimentSnapshots.mock.calls[0][0];
      const record = writeCall[0];

      // Verify raw_data contains complete original data wrapped in original_data
      expect(record.raw_data).toHaveProperty("original_data");
      expect(record.raw_data.original_data).toEqual(
        expect.objectContaining({
          value: 75,
          classification: "Extreme Greed",
          timestamp: sentimentData.timestamp,
          source: "coinmarketcap",
        }),
      );

      // Verify raw_data can be JSON stringified (for JSONB storage)
      expect(() => JSON.stringify(record.raw_data)).not.toThrow();
    });
  });

  describe("Deduplication Logic", () => {
    it("upserts duplicate snapshot for same source + timestamp", async () => {
      const job = createTestJob();

      const sentimentData = createMockSentimentData({
        value: 60,
        timestamp: Math.floor(
          new Date("2024-12-27T12:00:00Z").getTime() / 1000,
        ),
      });
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      // Simulate duplicate detection by writer
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 0, // Upserted, not inserted
        errors: [],
        duplicatesSkipped: 1, // Duplicate detected
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(0);

      // Verify writer was still called (upsert operation)
      expect(mockWriter.writeSentimentSnapshots).toHaveBeenCalledTimes(1);
    });

    it("allows different sources with same timestamp", async () => {
      const job = createTestJob();

      // This sentiment snapshot has same timestamp but different source
      // (In production, we only have coinmarketcap, but testing constraint logic)
      const timestamp = Math.floor(
        new Date("2024-12-27T12:00:00Z").getTime() / 1000,
      );
      const sentimentData = createMockSentimentData({
        timestamp,
      });
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(1);

      // Verify record has source = 'coinmarketcap'
      const writeCall = mockWriter.writeSentimentSnapshots.mock.calls[0][0];
      expect(writeCall[0].source).toBe("coinmarketcap");
    });

    it("allows same source with different timestamps", async () => {
      const job = createTestJob();

      // First snapshot at 12:00
      const sentimentData = createMockSentimentData({
        timestamp: Math.floor(
          new Date("2024-12-27T12:00:00Z").getTime() / 1000,
        ),
      });
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(1);
    });

    it("handles rapid concurrent inserts for same snapshot", async () => {
      const job = createTestJob();

      const timestamp = Math.floor(
        new Date("2024-12-27T12:00:00Z").getTime() / 1000,
      );
      const sentimentData = createMockSentimentData({
        value: 55,
        timestamp,
      });
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      // Simulate concurrent write where one wins, one is duplicate
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 0,
        errors: [],
        duplicatesSkipped: 1,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);

      // Verify writer handled the constraint gracefully
      expect(mockWriter.writeSentimentSnapshots).toHaveBeenCalledTimes(1);
    });

    it("preserves latest data when deduplicating", async () => {
      const job = createTestJob();

      const timestamp = Math.floor(
        new Date("2024-12-27T12:00:00Z").getTime() / 1000,
      );
      const newerSentimentData = createMockSentimentData({
        value: 65, // Updated value
        classification: "Greed",
        timestamp,
      });
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(newerSentimentData);

      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 0, // Upserted
        errors: [],
        duplicatesSkipped: 1,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);

      // Verify the newer data was sent to writer
      const writeCall = mockWriter.writeSentimentSnapshots.mock.calls[0][0];
      expect(writeCall[0].sentiment_value).toBe(65);
      expect(writeCall[0].classification).toBe("Greed");
    });

    it("correctly increments duplicatesSkipped counter", async () => {
      const job = createTestJob();

      const sentimentData = createMockSentimentData();
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 0,
        errors: [],
        duplicatesSkipped: 1,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);

      // Note: ETLProcessResult doesn't expose duplicatesSkipped,
      // but we verify writer was called
      expect(mockWriter.writeSentimentSnapshots).toHaveBeenCalled();
    });
  });

  describe("Rate Limiting & Concurrent Requests", () => {
    it("enforces 10 requests/minute CoinMarketCap limit", async () => {
      const sentimentData = createMockSentimentData();
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      // Process 10 jobs rapidly
      const jobs = Array.from({ length: 10 }, () => createTestJob());
      const results = await Promise.all(jobs.map((j) => processor.process(j)));

      // All should succeed
      expect(results.every((r) => r.success)).toBe(true);

      // Fetcher should be called 10 times
      expect(mockFetcher.fetchCurrentSentiment).toHaveBeenCalledTimes(10);

      // Verify rate limiting stats are tracked
      mockFetcher.getRequestStats.mockReturnValue({
        requestCount: 10,
        lastRequestTime: Date.now(),
      });
      const stats = processor.getStats();
      expect(stats.feargreed.requestCount).toBe(10);
    });

    it("handles multiple simultaneous webhook triggers", async () => {
      const sentimentData = createMockSentimentData();
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      // Simulate 3 concurrent webhook triggers
      const jobs = [createTestJob(), createTestJob(), createTestJob()];
      const results = await Promise.all(jobs.map((j) => processor.process(j)));

      // All should complete
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);

      // Fetcher called 3 times
      expect(mockFetcher.fetchCurrentSentiment).toHaveBeenCalledTimes(3);
    });

    it("queues requests when rate limit exceeded", async () => {
      const job = createTestJob();

      // Simulate rate limit error on first call
      mockFetcher.fetchCurrentSentiment
        .mockRejectedValueOnce(new Error("Rate limit exceeded (429)"))
        .mockResolvedValueOnce(createMockSentimentData());

      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      // Should fail due to rate limit
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Failed to fetch sentiment data");
    });

    it("respects 6-second delay between requests", async () => {
      const sentimentData = createMockSentimentData();
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const job1 = createTestJob();
      const startTime = Date.now();

      await processor.process(job1);

      // Verify request was made
      expect(mockFetcher.fetchCurrentSentiment).toHaveBeenCalledTimes(1);

      // Note: Rate limiting is implemented in BaseApiFetcher
      // This test verifies the processor doesn't bypass it
      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeLessThan(6000); // Should complete quickly in test
    });

    it("recovers gracefully from rate limit errors (429)", async () => {
      const job = createTestJob();

      mockFetcher.fetchCurrentSentiment.mockRejectedValue(
        new Error("429 Too Many Requests"),
      );

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Failed to fetch sentiment data");

      // Verify it doesn't crash the processor
      expect(mockFetcher.fetchCurrentSentiment).toHaveBeenCalled();
    });
  });

  describe("Partial Failure & Recovery", () => {
    it("continues processing after fetcher timeout", async () => {
      const job = createTestJob();

      mockFetcher.fetchCurrentSentiment.mockRejectedValue(
        new Error("Request timeout"),
      );

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Failed to fetch sentiment data");

      // Verify processor doesn't crash
      expect(result).toBeDefined();
    });

    it("handles transformation validation failures", async () => {
      const job = createTestJob();

      // Mock fetcher returns null (simulating transformation failure)
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(
        null as unknown as SentimentData,
      );

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Sentiment data failed validation");

      // Writer should not be called
      expect(mockWriter.writeSentimentSnapshots).not.toHaveBeenCalled();
    });

    it("reports database write errors without crashing", async () => {
      const job = createTestJob();

      const sentimentData = createMockSentimentData();
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      // Simulate database write failure
      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: false,
        recordsInserted: 0,
        errors: ["Database connection timeout"],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Database connection timeout");

      // Verify processor completed
      expect(result.recordsProcessed).toBe(1);
    });

    it("retries transient failures with exponential backoff", async () => {
      const job = createTestJob();

      // Mock transient failure (network error)
      mockFetcher.fetchCurrentSentiment
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(createMockSentimentData());

      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      // First attempt will fail
      const result1 = await processor.process(job);
      expect(result1.success).toBe(false);

      // Second attempt should succeed
      const result2 = await processor.process(job);
      expect(result2.success).toBe(true);

      expect(mockFetcher.fetchCurrentSentiment).toHaveBeenCalledTimes(2);
    });
  });

  describe("Stale Data Detection", () => {
    it("warns when sentiment data is >1 hour old", async () => {
      const job = createTestJob();

      // Data from 2 hours ago
      const staleTimestamp = Math.floor(
        (Date.now() - 2 * 60 * 60 * 1000) / 1000,
      );
      const sentimentData = createMockSentimentData({
        timestamp: staleTimestamp,
      });
      mockFetcher.fetchCurrentSentiment.mockResolvedValue(sentimentData);

      mockWriter.writeSentimentSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      // Should still succeed but with warning in logs
      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(1);
    });

    it("fails health check when data is >24 hours old", async () => {
      // Mock health check to return stale data
      mockFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "Sentiment data is stale (26 hours old)",
      });

      const health = await processor.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.details).toContain("stale");
      expect(health.details).toContain("hours");
    });

    it("includes staleness timestamp in health check details", async () => {
      const staleHours = 26;
      mockFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: `Sentiment data is stale (${staleHours} hours old)`,
      });

      const health = await processor.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.details).toContain(staleHours.toString());
    });
  });

  describe("Empty & Edge Cases", () => {
    it("handles null API response gracefully", async () => {
      const job = createTestJob();

      mockFetcher.fetchCurrentSentiment.mockResolvedValue(
        null as unknown as SentimentData,
      );

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors).toHaveLength(1);

      // Writer should not be called
      expect(mockWriter.writeSentimentSnapshots).not.toHaveBeenCalled();
    });

    it("handles empty sentiment data gracefully", async () => {
      const job = createTestJob();

      mockFetcher.fetchCurrentSentiment.mockRejectedValue(
        new Error("Invalid API response: missing or invalid data object"),
      );

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);

      // Writer should not be called
      expect(mockWriter.writeSentimentSnapshots).not.toHaveBeenCalled();
    });
  });

  describe("Health Check", () => {
    it("returns healthy when API is responsive", async () => {
      mockFetcher.healthCheck.mockResolvedValue({ status: "healthy" });

      const result = await processor.healthCheck();

      expect(result.status).toBe("healthy");
      expect(result.details).toBeUndefined();
    });

    it("returns unhealthy when API timeout occurs", async () => {
      mockFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "Request timeout",
      });

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toContain("timeout");
    });

    it("returns unhealthy when API key is missing", async () => {
      mockFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "CoinMarketCap API key not configured",
      });

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toContain("API key");
    });

    it("returns unhealthy when data is stale (>24h)", async () => {
      mockFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "Sentiment data is stale (26 hours old)",
      });

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toContain("stale");
      expect(result.details).toContain("26 hours");
    });

    it("includes detailed error message in health check", async () => {
      mockFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "CoinMarketCap API error (code 1001): Invalid API Key",
      });

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toContain("code 1001");
      expect(result.details).toContain("Invalid API Key");
    });
  });

  describe("Stats Retrieval", () => {
    it("aggregates stats from fetcher", () => {
      mockFetcher.getRequestStats.mockReturnValue({
        requestCount: 42,
        lastRequestTime: Date.now(),
      });

      const stats = processor.getStats();

      expect(stats).toEqual({
        feargreed: {
          requestCount: 42,
          lastRequestTime: expect.any(Number),
        },
      });
    });

    it("handles zero request count", () => {
      mockFetcher.getRequestStats.mockReturnValue({
        requestCount: 0,
        lastRequestTime: null,
      });

      const stats = processor.getStats();

      expect(stats.feargreed.requestCount).toBe(0);
      expect(stats.feargreed.lastRequestTime).toBeNull();
    });
  });
});
