import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  sentimentApiResponseSchema,
  validateSentimentApiResponse,
} from "@/schemas/api/sentimentSchemas";

const BASE_SENTIMENT = {
  timestamp: "2025-12-04T00:00:00Z",
  source: "alternative.me",
};

describe("sentimentSchemas", () => {
  describe("sentimentApiResponseSchema", () => {
    describe("valid sentiment data", () => {
      it.each([
        [26, "Fear", true],
        [26, "Fear", undefined],
        [0, "Extreme Fear", undefined],
        [100, "Extreme Greed", undefined],
        [25, "Fear", undefined],
        [50, "Neutral", undefined],
        [75, "Greed", undefined],
        [50, "Neutral", false],
      ])("validates value=%d status=%s cached=%s", (value, status, cached) => {
        const data = {
          ...BASE_SENTIMENT,
          value,
          status,
          ...(cached !== undefined && { cached }),
        };
        expect(() => sentimentApiResponseSchema.parse(data)).not.toThrow();
      });
    });

    describe("invalid sentiment data", () => {
      it.each([
        ["value below 0", { value: -1, status: "Fear" }],
        ["value above 100", { value: 101, status: "Extreme Greed" }],
        ["non-integer value", { value: 50.5, status: "Neutral" }],
        ["missing value", { status: "Fear" }],
        ["missing status", { value: 26 }],
        [
          "missing timestamp",
          {
            value: 26,
            status: "Fear",
            timestamp: undefined,
            source: "alternative.me",
          },
        ],
        [
          "missing source",
          {
            value: 26,
            status: "Fear",
            timestamp: "2025-12-04T00:00:00Z",
            source: undefined,
          },
        ],
        ["invalid value type", { value: "26", status: "Fear" }],
        ["invalid status type", { value: 26, status: 26 }],
        ["invalid cached type", { value: 26, status: "Fear", cached: "true" }],
      ])("rejects %s", (_label, overrides) => {
        const data = { ...BASE_SENTIMENT, ...overrides };
        expect(() => sentimentApiResponseSchema.parse(data)).toThrow(ZodError);
      });
    });
  });

  describe("validateSentimentApiResponse", () => {
    it("validates and returns valid sentiment data", () => {
      const validData = {
        value: 26,
        status: "Fear",
        ...BASE_SENTIMENT,
        cached: true,
      };

      const result = validateSentimentApiResponse(validData);
      expect(result).toEqual(validData);
    });

    it("throws ZodError for invalid data", () => {
      const invalidData = {
        value: 101,
        status: "Invalid",
      };

      expect(() => validateSentimentApiResponse(invalidData)).toThrow(ZodError);
    });
  });
});
