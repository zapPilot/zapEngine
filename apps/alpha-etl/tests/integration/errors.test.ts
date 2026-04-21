import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express, NextFunction, Request, Response } from "express";
// import { app } from '../../src/app.js';
import {
  DatabaseError,
  ValidationError,
  APIError,
} from "../../src/utils/errors.js";

// Mock logger
vi.mock("../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../setup/mocks.js");
  return mockLogger();
});

// Mock database config
vi.mock("../../src/config/database.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/config/database.js")>();
  return {
    ...actual,
    testDatabaseConnection: vi.fn().mockResolvedValue(true),
    getDbPool: vi.fn(() => ({
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(),
    })),
  };
});

// Mock dependencies to trigger specific errors
const { mockEnqueue } = vi.hoisted(() => {
  return { mockEnqueue: vi.fn() };
});

// We need to mock the module where ETLJobQueue is defined
vi.mock("../../src/modules/core/jobQueue.js", () => {
  return {
    ETLJobQueue: vi.fn().mockImplementation(function ETLJobQueue() {
      return {
        enqueue: mockEnqueue,
        getJob: vi.fn(),
        getResult: vi.fn(),
      };
    }),
  };
});

describe("Error Handling Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("404 Not Found", () => {
    it("should return standardized ApiError for unknown routes", async () => {
      // Dynamically import app to test real 404 handler
      const module = await import("../../src/app.js");
      const app = module.app;

      const response = await request(app)
        .get("/api/unknown/route/12345")
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: expect.stringContaining("Route not found"),
          source: "system",
        },
        timestamp: expect.any(String),
      });
      // Check context requestId exists
      expect(response.body.error.context.requestId).toBeDefined();
    });
  });

  describe("Global Error Handler", () => {
    let testApp: Express;

    beforeEach(async () => {
      // Create a fresh app for testing middleware in isolation
      const express = (await import("express")).default;
      // Important: We must not import app from global, but create new one
      testApp = express();
      testApp.use(express.json());
    });

    it("should handle custom APIError", async () => {
      const { errorHandler } =
        await import("../../src/middleware/errorHandler.js");
      testApp.get(
        "/err-api",
        (_req: Request, _res: Response, next: NextFunction) => {
          // Use valid DataSource 'debank' since error handler now validates source
          next(new APIError("Custom API Error", 402, "http://test", "debank"));
        },
      );
      testApp.use(errorHandler);

      const response = await request(testApp).get("/err-api").expect(402);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: "API_ERROR",
          message: "Custom API Error",
          source: "debank",
          context: {
            url: "http://test",
          },
        },
      });
    });

    it("should handle ValidationError", async () => {
      const { errorHandler } =
        await import("../../src/middleware/errorHandler.js");
      testApp.get(
        "/err-validation",
        (_req: Request, _res: Response, next: NextFunction) => {
          next(new ValidationError("Field invalid", "trigger", "invalid-val"));
        },
      );
      testApp.use(errorHandler);

      const response = await request(testApp)
        .get("/err-validation")
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Field invalid",
          context: {
            field: "trigger",
            value: "invalid-val",
          },
        },
      });
    });

    it("should handle ZodError", async () => {
      const { errorHandler } =
        await import("../../src/middleware/errorHandler.js");
      const { z } = await import("zod");

      testApp.get(
        "/err-zod",
        (_req: Request, _res: Response, next: NextFunction) => {
          const schema = z.object({ id: z.number() });
          try {
            schema.parse({ id: "not-a-number" });
          } catch (err) {
            next(err);
          }
        },
      );
      testApp.use(errorHandler);

      const response = await request(testApp).get("/err-zod").expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request payload",
          source: "system",
          context: {
            issues: expect.arrayContaining([
              expect.objectContaining({
                code: "invalid_type",
                expected: "number",
              }),
            ]),
          },
        },
      });
    });

    it("should handle DatabaseError", async () => {
      const { errorHandler } =
        await import("../../src/middleware/errorHandler.js");
      testApp.get(
        "/err-db",
        (_req: Request, _res: Response, next: NextFunction) => {
          next(new DatabaseError("Connection failed", "SELECT *"));
        },
      );
      testApp.use(errorHandler);

      const response = await request(testApp).get("/err-db").expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: "DATABASE_ERROR",
          message: "Database operation failed",
          source: "database",
        },
      });
      expect(response.body.error.message).not.toContain("SELECT *");
    });

    it("should handle unknown generic Errors as INTERNAL_ERROR", async () => {
      const { errorHandler } =
        await import("../../src/middleware/errorHandler.js");
      testApp.get(
        "/err-generic",
        (_req: Request, _res: Response, next: NextFunction) => {
          next(new Error("Unexpected system crash"));
        },
      );
      testApp.use(errorHandler);

      const response = await request(testApp).get("/err-generic").expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
          source: "system",
        },
      });
      expect(response.body.error.message).toBe("Internal server error");
    });
  });
});
