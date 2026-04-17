import { Router, type Request, type Response } from "express";
import { logger } from "../utils/logger.js";
import {
  DATA_SOURCES,
  type HealthCheckResponse,
  type DataSource,
  type SourceHealth,
} from "../types/index.js";
import {
  getHealthState,
  type HealthDetailStatus,
} from "../modules/core/healthStatus.js";

/**
 * Convert health details to sources record, filtering to only valid DataSource keys
 * Returns empty object if no details provided (for backwards compatibility)
 */
function extractSourcesHealth(
  details: Record<string, HealthDetailStatus | undefined> | undefined | null,
): Record<DataSource, SourceHealth> {
  const sources: Partial<Record<DataSource, SourceHealth>> = {};

  if (details) {
    for (const source of DATA_SOURCES) {
      const sourceHealth = details[source];
      if (sourceHealth) {
        sources[source] = {
          status: sourceHealth.status,
          details: sourceHealth.details,
          lastCheck: sourceHealth.lastCheck,
        };
      }
    }
  }

  return sources as Record<DataSource, SourceHealth>;
}

function buildHealthResponse(cachedState: ReturnType<typeof getHealthState>): {
  response: HealthCheckResponse;
  isHealthy: boolean;
} {
  const isHealthy = cachedState.status === "healthy";
  const details = cachedState.details;
  const dbHealthy = details?.database?.status === "healthy";
  const status = isHealthy ? "healthy" : "unhealthy";
  const now = new Date().toISOString();

  return {
    isHealthy,
    response: {
      success: true,
      data: {
        status,
        timestamp: now,
        version: "1.0.0",
        database: dbHealthy,
        uptime: process.uptime(),
        cached: cachedState.status !== "initializing",
        lastCheckedAt: cachedState.lastCheckedAt,
        message: cachedState.message,
        sources: extractSourcesHealth(details),
      },
      timestamp: now,
    },
  };
}

const router: Router = Router();

router.get("/", (req: Request, res: Response) => {
  const startTime = Date.now();
  const cachedState = getHealthState();
  const responseTime = Date.now() - startTime;
  const { response, isHealthy } = buildHealthResponse(cachedState);

  if (isHealthy) {
    logger.info("Health check served healthy state from cache", {
      responseTime,
      lastCheckedAt: cachedState.lastCheckedAt,
    });
    return res.json(response);
  }

  if (cachedState.status === "initializing") {
    logger.info("Health check requested during initialization window", {
      responseTime,
    });
  } else {
    logger.warn("Health check served unhealthy state from cache", {
      responseTime,
      lastCheckedAt: cachedState.lastCheckedAt,
      message: cachedState.message,
    });
  }

  return res.status(503).json(response);
});

export { router as healthRouter };
