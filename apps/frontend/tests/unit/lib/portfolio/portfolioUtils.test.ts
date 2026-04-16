import { describe, expect, it } from "vitest";

import { extractROIChanges } from "@/lib/portfolio/portfolioUtils";
import { LandingPageResponse } from "@/services/analyticsService";

describe("portfolioUtils", () => {
  describe("extractROIChanges", () => {
    it("should return zeros when portfolio_roi is missing", () => {
      const data = {} as LandingPageResponse;
      const result = extractROIChanges(data);
      expect(result).toEqual({ change7d: 0, change30d: 0 });
    });

    it("should prioritize windows format", () => {
      const data = {
        portfolio_roi: {
          windows: {
            "7d": { value: 10 },
            "30d": { value: 20 },
          },
          roi_7d: { value: 5 }, // Should be ignored
          roi_30d: { value: 5 }, // Should be ignored
        },
      } as unknown as LandingPageResponse;

      const result = extractROIChanges(data);
      expect(result).toEqual({ change7d: 10, change30d: 20 });
    });

    it("should fallback to legacy format when windows is missing", () => {
      const data = {
        portfolio_roi: {
          roi_7d: { value: 5 },
          roi_30d: { value: 15 },
        },
      } as unknown as LandingPageResponse;

      const result = extractROIChanges(data);
      expect(result).toEqual({ change7d: 5, change30d: 15 });
    });

    it("should handle missing values in periods", () => {
      const data = {
        portfolio_roi: {
          windows: {
            // Missing 7d
            "30d": { value: 20 },
          },
        },
      } as unknown as LandingPageResponse;

      const result = extractROIChanges(data);
      expect(result).toEqual({ change7d: 0, change30d: 20 });
    });

    it("should handle null values in legacy format", () => {
      const data = {
        portfolio_roi: {
          roi_7d: null,
          roi_30d: undefined,
        },
      } as unknown as LandingPageResponse;

      const result = extractROIChanges(data);
      expect(result).toEqual({ change7d: 0, change30d: 0 });
    });
  });
});
