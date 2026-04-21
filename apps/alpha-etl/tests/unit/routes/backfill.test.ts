/**
 * Unit tests for Backfill route
 * Tests POST /backfill endpoint for token price backfill operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";

// Mock the logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

vi.mock("../../../src/utils/logger.js", () => ({
  logger: mockLogger,
}));

// Mock TokenPricePipeline (formerly TokenPriceProcessor)
const mockProcessor = {
  backfillHistory: vi.fn(),
  updateDmaForToken: vi.fn(),
};

vi.mock("../../../src/modules/token-price/index.js", () => ({
  TokenPriceETLProcessor: vi.fn(() => {
    return mockProcessor;
  }),
}));

// Create test app with backfill router
const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  // Add request ID middleware
  app.use((req, _res, next) => {
    if (!req.headers["x-request-id"]) {
      req.headers["x-request-id"] = "test-request-id";
    }
    next();
  });

  const { backfillRouter } = await import("../../../src/routes/backfill.js");
  app.use("/backfill", backfillRouter);

  return app;
};

describe("Backfill Router", () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockProcessor.updateDmaForToken.mockResolvedValue({ recordsInserted: 20 });
    app = await createTestApp();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("POST /backfill", () => {
    it("should process valid backfill request successfully", async () => {
      mockProcessor.backfillHistory.mockResolvedValue({
        requested: 30,
        existing: 10,
        fetched: 20,
        inserted: 20,
      });

      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC", daysBack: 30 }],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(1);
      expect(response.body.data.results[0].success).toBe(true);
      expect(response.body.data.results[0].data).toMatchObject({
        tokenSymbol: "BTC",
        tokenId: "bitcoin",
        requested: 30,
        existing: 10,
        fetched: 20,
        inserted: 20,
        dmaAttempted: true,
        dmaUpserted: 20,
        dmaRetries: 0,
        dmaSuccess: true,
      });
    });

    it("should handle multiple tokens in single request", async () => {
      mockProcessor.backfillHistory.mockResolvedValue({
        requested: 10,
        existing: 5,
        fetched: 5,
        inserted: 5,
      });

      const payload = {
        tokens: [
          { tokenId: "bitcoin", tokenSymbol: "BTC", daysBack: 10 },
          { tokenId: "ethereum", tokenSymbol: "ETH", daysBack: 10 },
        ],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(2);
      expect(mockProcessor.backfillHistory).toHaveBeenCalledTimes(2);
      expect(mockProcessor.updateDmaForToken).toHaveBeenCalledTimes(2);
    });

    it("should handle validation errors for invalid payload", async () => {
      const payload = {
        tokens: [
          { tokenId: "", tokenSymbol: "BTC", daysBack: 30 }, // Invalid empty tokenId
        ],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.context.issues).toBeDefined();
    });

    it("should use default daysBack when not provided", async () => {
      mockProcessor.backfillHistory.mockResolvedValue({
        requested: 30,
        existing: 0,
        fetched: 30,
        inserted: 30,
      });

      const payload = {
        tokens: [
          { tokenId: "bitcoin", tokenSymbol: "BTC" }, // No daysBack
        ],
        trigger: "manual",
      };

      await request(app).post("/backfill").send(payload).expect(200);

      expect(mockProcessor.backfillHistory).toHaveBeenCalledWith(
        30, // Default daysBack
        "bitcoin",
        "BTC",
      );
      expect(mockProcessor.updateDmaForToken).toHaveBeenCalledWith(
        "BTC",
        "bitcoin",
        expect.stringContaining("BTC:dma"),
      );
    });

    it("should handle partial failures (some tokens fail)", async () => {
      mockProcessor.backfillHistory
        .mockResolvedValueOnce({
          requested: 10,
          existing: 0,
          fetched: 10,
          inserted: 10,
        })
        .mockRejectedValueOnce(new Error("API rate limited"));

      const payload = {
        tokens: [
          { tokenId: "bitcoin", tokenSymbol: "BTC", daysBack: 10 },
          { tokenId: "ethereum", tokenSymbol: "ETH", daysBack: 10 },
        ],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true); // Overall success is true even with partial content if designed that way
      expect(response.body.data.results[0].success).toBe(true);
      expect(response.body.data.results[1].success).toBe(false);
      expect(response.body.data.results[1].error.message).toBe(
        "API rate limited",
      );
    });

    it("should retry DMA update and succeed", async () => {
      mockProcessor.backfillHistory.mockResolvedValue({
        requested: 10,
        existing: 0,
        fetched: 10,
        inserted: 10,
      });
      mockProcessor.updateDmaForToken
        .mockRejectedValueOnce(new Error("DMA temporary failure"))
        .mockResolvedValueOnce({ recordsInserted: 10 });

      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC", daysBack: 10 }],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results[0].success).toBe(true);
      expect(response.body.data.results[0].data.dmaRetries).toBe(1);
      expect(response.body.data.results[0].data.dmaSuccess).toBe(true);
      expect(mockProcessor.updateDmaForToken).toHaveBeenCalledTimes(2);
    });

    it("should fail token result when DMA fails after retries", async () => {
      mockProcessor.backfillHistory.mockResolvedValue({
        requested: 10,
        existing: 0,
        fetched: 10,
        inserted: 10,
      });
      mockProcessor.updateDmaForToken.mockRejectedValue(
        new Error("DMA permanently failed"),
      );

      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC", daysBack: 10 }],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe("All backfill requests failed");
      expect(mockProcessor.updateDmaForToken).toHaveBeenCalledTimes(3);
    });

    it("should reject missing tokens array", async () => {
      const payload = {
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe("Invalid request payload");
      const issues = JSON.stringify(response.body.error.context.issues);
      expect(issues).toContain("tokens");
    });

    it("should reject empty tokens array", async () => {
      const payload = {
        tokens: [],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should reject too many tokens (>10)", async () => {
      const payload = {
        tokens: Array(11).fill({ tokenId: "bitcoin", tokenSymbol: "BTC" }),
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should reject invalid trigger value", async () => {
      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC" }],
        trigger: "invalid",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe("Invalid request payload");
      const issues = JSON.stringify(response.body.error.context.issues);
      expect(issues).toContain("trigger");
    });

    it("should reject missing trigger", async () => {
      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC" }],
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should reject invalid daysBack (too large)", async () => {
      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC", daysBack: 500 }],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should reject invalid daysBack (negative)", async () => {
      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC", daysBack: -5 }],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should reject empty tokenId", async () => {
      const payload = {
        tokens: [{ tokenId: "", tokenSymbol: "BTC" }],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should log backfill requests", async () => {
      mockProcessor.backfillHistory.mockResolvedValue({
        requested: 10,
        existing: 0,
        fetched: 10,
        inserted: 10,
      });

      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC", daysBack: 10 }],
        trigger: "manual",
      };

      await request(app).post("/backfill").send(payload).expect(200);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Backfill request received",
        expect.objectContaining({
          trigger: "manual",
          tokenCount: 1,
        }),
      );
    });

    it("should include duration in results", async () => {
      mockProcessor.backfillHistory.mockResolvedValue({
        requested: 10,
        existing: 0,
        fetched: 10,
        inserted: 10,
      });

      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC", daysBack: 10 }],
        trigger: "scheduled",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(200);

      expect(response.body.data.results[0].data).toHaveProperty("duration");
      expect(typeof response.body.data.results[0].data.duration).toBe("number");
    });

    it("should include timestamp in response", async () => {
      mockProcessor.backfillHistory.mockResolvedValue({
        requested: 10,
        existing: 0,
        fetched: 10,
        inserted: 10,
      });

      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC" }],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(200);

      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    it("should return error response when all tokens fail", async () => {
      mockProcessor.backfillHistory
        .mockRejectedValueOnce(new Error("First token failed"))
        .mockRejectedValueOnce(new Error("Second token failed"));

      const payload = {
        tokens: [
          { tokenId: "bitcoin", tokenSymbol: "BTC", daysBack: 10 },
          { tokenId: "ethereum", tokenSymbol: "ETH", daysBack: 10 },
        ],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe("All backfill requests failed");
      expect(response.body.error.code).toBe("API_ERROR");
    });

    it("should handle non-Error exception in processor", async () => {
      mockProcessor.backfillHistory.mockRejectedValue(
        "String error without Error type",
      );

      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC" }],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(200);

      // Even with string error, it should be handled gracefully
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe("All backfill requests failed");
    });

    it("should handle generic exception outside validation", async () => {
      // Force an exception by making the mock throw during iteration
      mockProcessor.backfillHistory.mockImplementation(() => {
        throw new Error("Unexpected internal error");
      });

      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC" }],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(200);

      // The caught error becomes a failed result, then all-failures path triggers
      expect(response.body.success).toBe(false);
    });

    it("should return 500 when a non-validation Error is thrown before processing", async () => {
      mockLogger.info.mockImplementationOnce(() => {
        throw new Error("Logger failed");
      });

      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC" }],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("API_ERROR");
      expect(response.body.error.message).toBe("Logger failed");
    });

    it("should return 500 with unknown error when a non-Error is thrown before processing", async () => {
      mockLogger.info.mockImplementationOnce(() => {
        // eslint-disable-next-line no-throw-literal
        throw "String failure";
      });

      const payload = {
        tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC" }],
        trigger: "manual",
      };

      const response = await request(app)
        .post("/backfill")
        .send(payload)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("API_ERROR");
      expect(response.body.error.message).toBe("Unknown error");
    });
  });
});
