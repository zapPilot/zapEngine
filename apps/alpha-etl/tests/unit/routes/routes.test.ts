import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const mockGetJob = vi.fn();
const mockGetResult = vi.fn();
const mockEnqueue = vi.fn();

vi.mock("../../../src/modules/core/jobQueueSingleton.js", () => ({
  etlJobQueue: {
    getJob: mockGetJob,
    getResult: mockGetResult,
    enqueue: mockEnqueue,
  },
}));

vi.mock("../../../src/modules/core/healthStatus.js");
vi.mock("../../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../../setup/mocks.js");
  return mockLogger();
});

import { getHealthState } from "../../../src/modules/core/healthStatus.js";

describe("Routes", () => {
  let app: express.Express;
  let backfillRouter: unknown;
  let healthRouter: unknown;
  let webhooksRouter: unknown;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    vi.clearAllMocks();

    // Dynamic import to avoid hoisting issues
    backfillRouter = (await import("../../../src/routes/backfill.js"))
      .backfillRouter;
    healthRouter = (await import("../../../src/routes/health.js")).healthRouter;
    webhooksRouter = (await import("../../../src/routes/webhooks.js"))
      .webhooksRouter;

    // Reset default mock behaviors
    mockGetJob.mockReturnValue(null);
    mockGetResult.mockReturnValue(null);
    mockEnqueue.mockResolvedValue({ jobId: "job1" });
  });

  describe("Backfill Route", () => {
    beforeEach(() => {
      app.use("/backfill", backfillRouter);
    });

    it("should handle Zod validation errors", async () => {
      const res = await request(app)
        .post("/backfill")
        .send({ invalid: "payload" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should queue valid token backfill requests", async () => {
      const res = await request(app)
        .post("/backfill")
        .send({
          tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC" }],
        });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBe("job1");
      expect(mockEnqueue).toHaveBeenCalledWith({
        sources: ["token-price"],
        tasks: [
          {
            source: "token-price",
            operation: "backfill",
            tokens: [{ tokenId: "bitcoin", tokenSymbol: "BTC" }],
          },
        ],
      });
    });
  });

  describe("Health Route", () => {
    beforeEach(() => {
      app.use("/health", healthRouter);
    });

    it("should handle unhealthy state and force status update", async () => {
      (getHealthState as unknown).mockReturnValue({
        status: "unhealthy",
        lastCheckedAt: new Date(),
        message: "error",
      });

      const res = await request(app).get("/health");
      expect(res.status).toBe(503);
      expect(res.body.data.status).toBe("unhealthy");
    });
  });

  describe("Webhooks Route", () => {
    beforeEach(() => {
      app.use("/webhooks", webhooksRouter);
    });

    it("should return 500 if job status is failed", async () => {
      mockGetJob.mockReturnValue({
        status: "failed",
        createdAt: new Date(),
        jobId: "job1",
        sources: ["defillama"],
      });
      mockGetResult.mockReturnValue({
        success: false,
        error: { code: "API_ERROR", message: "Job failed" },
      });

      const res = await request(app).get("/webhooks/jobs/job1");
      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe("Job failed");
    });

    it("should handle Pipedream webhook source/sources validation", async () => {
      const res = await request(app)
        .post("/webhooks/pipedream")
        .send({
          trigger: "manual",
          source: "defillama",
          sources: ["debank"],
        });
      expect(res.status).toBe(400);
    });
  });
});
