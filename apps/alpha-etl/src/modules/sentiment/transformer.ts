/**
 * Sentiment Data Transformer
 *
 * Transforms and validates raw sentiment data into database-ready format
 */

import { z } from "zod";
import { DATA_LIMITS } from "../../config/database.js";
import { transformBatchWithLogging } from "../../core/transformers/baseTransformer.js";
import type { SentimentSnapshotInsert } from "../../types/database.js";
import { toErrorMessage } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import {
  SentimentDataSchema,
  type SentimentData,
} from "../../modules/sentiment/schema.js";

const SENTIMENT_CLASSIFICATION_BOUNDARIES: Record<string, [number, number]> = {
  "Extreme Fear": [DATA_LIMITS.SENTIMENT_MIN, 25],
  Fear: [26, 45],
  Neutral: [46, 54],
  Greed: [55, 75],
  "Extreme Greed": [76, DATA_LIMITS.SENTIMENT_MAX],
};

export class SentimentDataTransformer {
  private createSnapshotInsert(
    validated: SentimentData,
    rawData: SentimentData,
    snapshotTime: string,
  ): SentimentSnapshotInsert {
    return {
      sentiment_value: validated.value,
      classification: validated.classification,
      source: validated.source.toLowerCase(),
      snapshot_time: snapshotTime,
      raw_data: {
        original_data: rawData,
        transformed_at: new Date().toISOString(),
      },
    };
  }

  private logTransformationError(error: unknown, rawData: SentimentData): void {
    if (error instanceof z.ZodError) {
      logger.error("Sentiment data validation failed", {
        errors: error.errors,
        rawData,
      });
      return;
    }

    logger.error("Failed to transform sentiment data", {
      error: toErrorMessage(error),
      rawData,
    });
  }

  transform(rawData: SentimentData): SentimentSnapshotInsert | null {
    try {
      const validated = SentimentDataSchema.parse(rawData);

      if (
        !this.isValidClassificationForValue(
          validated.value,
          validated.classification,
        )
      ) {
        logger.warn("Classification does not match sentiment value", {
          value: validated.value,
          classification: validated.classification,
        });
      }

      const snapshotTime = this.convertTimestamp(validated.timestamp);
      if (!snapshotTime) {
        logger.error("Failed to convert timestamp", {
          timestamp: validated.timestamp,
        });
        return null;
      }

      const transformed = this.createSnapshotInsert(
        validated,
        rawData,
        snapshotTime,
      );

      logger.debug("Successfully transformed sentiment data", {
        sentiment_value: transformed.sentiment_value,
        classification: transformed.classification,
        source: transformed.source,
      });

      return transformed;
    } catch (error) {
      this.logTransformationError(error, rawData);
      return null;
    }
  }

  transformBatch(rawDataArray: SentimentData[]): SentimentSnapshotInsert[] {
    return transformBatchWithLogging(
      rawDataArray,
      (item) => this.transform(item),
      "Sentiment data",
    );
  }

  private convertTimestamp(unixTimestamp: number): string | null {
    try {
      const date = new Date(unixTimestamp * 1000);
      const now = Date.now();
      const timestamp = date.getTime();
      if (this.isTimestampOutsideExpectedRange(timestamp, now)) {
        logger.warn("Timestamp outside expected range", {
          unixTimestamp,
          date: date.toISOString(),
        });
      }

      return date.toISOString();
    } catch (error) {
      logger.error("Failed to convert timestamp", {
        unixTimestamp,
        error,
      });
      return null;
    }
  }

  private isValidClassificationForValue(
    value: number,
    classification: string,
  ): boolean {
    const [min, max] = this.resolveClassificationRange(classification);
    return value >= min && value <= max;
  }

  private resolveClassificationRange(classification: string): [number, number] {
    return (
      SENTIMENT_CLASSIFICATION_BOUNDARIES[classification] || [
        DATA_LIMITS.SENTIMENT_MIN,
        DATA_LIMITS.SENTIMENT_MAX,
      ]
    );
  }

  private isTimestampOutsideExpectedRange(
    timestampMs: number,
    nowMs: number,
  ): boolean {
    const minTimestampMs = nowMs - 365 * 24 * 60 * 60 * 1000;
    const maxTimestampMs = nowMs + 60 * 60 * 1000;
    return timestampMs < minTimestampMs || timestampMs > maxTimestampMs;
  }
}
