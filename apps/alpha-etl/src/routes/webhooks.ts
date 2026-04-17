import { Router } from "express";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import { ETLJobQueue } from "../modules/core/jobQueue.js";
import { toErrorMessage } from "../utils/errors.js";
import { maskWalletAddress } from "../utils/mask.js";
import {
  buildSuccessApiResponse,
  buildErrorApiResponse,
  buildWebhookErrorApiResponse,
  getRequestId,
} from "../utils/apiResponse.js";
import { webhookPayloadSchema, walletFetchSchema } from "./webhooks.schemas.js";
import {
  buildJobStatusApiResponse,
  buildJobStatusResponse,
  determineJobStatusCode,
  validateJobStatusResponse,
} from "./webhooks.responses.js";

const router: Router = Router();
const jobQueue = new ETLJobQueue();
const DEFAULT_SOURCES = ["defillama", "debank", "hyperliquid"] as const;

router.post("/pipedream", async (req, res) => {
  const requestId = getRequestId(req.headers as Record<string, unknown>);

  try {
    // parse returns the transformed data
    const payload = webhookPayloadSchema.parse(req.body);

    logger.info("Webhook received from Pipedream", {
      requestId,
      trigger: payload.trigger,
      sources: payload.sources,
    });

    const job = await jobQueue.enqueue({
      trigger: payload.trigger,
      sources: payload.sources ? [...payload.sources] : [...DEFAULT_SOURCES],
      filters: payload.filters,
    });

    logger.info("ETL job queued successfully", {
      requestId,
      jobId: job.jobId,
    });

    return res.json(buildSuccessApiResponse({ jobId: job.jobId }));
  } catch (error) {
    logger.error("Webhook processing failed:", { error, requestId });

    const response = buildWebhookErrorApiResponse(
      "API_ERROR",
      error instanceof Error ? error.message : "Unknown error",
      requestId,
    );

    return res.status(400).json(response);
  }
});

/**
 * POST /webhooks/wallet-fetch
 * Trigger on-demand wallet data fetch from account-engine
 *
 * This endpoint is called by account-engine when a user connects a new wallet
 * or manually refreshes their portfolio data. Unlike the Pipedream webhook
 * (which batch-processes VIP users), this endpoint processes a single wallet
 * address and returns immediately with a jobId for status tracking.
 */
router.post("/wallet-fetch", async (req, res) => {
  const requestId = getRequestId(req.headers as Record<string, unknown>);

  try {
    const payload = walletFetchSchema.parse(req.body);

    // Validate webhook secret if configured
    if (process.env.WEBHOOK_SECRET) {
      if (!payload.secret || payload.secret !== process.env.WEBHOOK_SECRET) {
        logger.warn("Invalid webhook secret", {
          requestId,
          userId: payload.userId,
          wallet: maskWalletAddress(payload.walletAddress),
        });
        return res
          .status(401)
          .json(
            buildWebhookErrorApiResponse(
              "UNAUTHORIZED",
              "Invalid webhook secret",
              requestId,
            ),
          );
      }
    }

    logger.info("Wallet fetch webhook received", {
      requestId,
      userId: payload.userId,
      walletAddress: maskWalletAddress(payload.walletAddress),
      trigger: payload.trigger,
    });

    // Enqueue job with metadata for single wallet processing
    const job = await jobQueue.enqueue({
      trigger: payload.trigger,
      sources: ["debank"],
      metadata: {
        userId: payload.userId,
        walletAddress: payload.walletAddress,
        jobType: "wallet_fetch",
      },
    });

    logger.info("Wallet fetch job queued successfully", {
      requestId,
      jobId: job.jobId,
      userId: payload.userId,
      walletAddress: maskWalletAddress(payload.walletAddress),
    });

    return res.status(202).json(buildSuccessApiResponse({ jobId: job.jobId }));
  } catch (error) {
    logger.error("Wallet fetch webhook processing failed:", {
      error,
      requestId,
    });

    if (error instanceof z.ZodError) {
      const response = buildWebhookErrorApiResponse(
        "VALIDATION_ERROR",
        "Invalid wallet fetch payload",
        requestId,
        { errors: error.errors },
      );
      return res.status(400).json(response);
    }

    const response = buildWebhookErrorApiResponse(
      "API_ERROR",
      toErrorMessage(error),
      requestId,
    );

    return res.status(500).json(response);
  }
});

router.get("/jobs/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const requestId = getRequestId(req.headers as Record<string, unknown>);

  try {
    const job = jobQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json(
        buildErrorApiResponse({
          code: "API_ERROR",
          message: "Job not found",
          source: "system",
        }),
      );
    }

    const result = jobQueue.getResult(jobId);

    logger.info("Job status requested", {
      requestId,
      jobId,
      status: job.status,
      hasResult: !!result,
    });

    const response = buildJobStatusResponse(job, result);
    const { validated, validationError } = validateJobStatusResponse(response);

    if (validationError) {
      logger.warn("Job status schema validation failed", {
        jobId,
        error: validationError,
      });
    }

    const statusCode = determineJobStatusCode(job, response, result);
    const apiResponse = buildJobStatusApiResponse(
      statusCode,
      validated,
      response.error,
    );

    return res.status(statusCode).json(apiResponse);
  } catch (error) {
    logger.error("Job status retrieval failed:", { error, requestId, jobId });

    return res.status(500).json(
      buildErrorApiResponse({
        code: "API_ERROR",
        message: "Failed to retrieve job status",
        source: "system",
      }),
    );
  }
});

export { router as webhooksRouter };
