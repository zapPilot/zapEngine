import { describe, expect, it } from "vitest";

import {
  buildDateRange,
  normalizeToScale,
  toDateKey,
} from "@/lib/analytics/utils/dateUtils";

describe("dateUtils", () => {
  describe("toDateKey", () => {
    it("should return null for null input", () => {
      expect(toDateKey(null)).toBeNull();
    });

    it("should return null for undefined input", () => {
      expect(toDateKey(undefined)).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(toDateKey("")).toBeNull();
    });

    it("should return date key for already formatted YYYY-MM-DD string", () => {
      expect(toDateKey("2024-01-15")).toBe("2024-01-15");
    });

    it("should extract date key from ISO datetime string", () => {
      expect(toDateKey("2024-01-15T12:00:00Z")).toBe("2024-01-15");
    });

    it("should parse natural language date and return valid format", () => {
      const result = toDateKey("Jan 15, 2024");
      // Result depends on timezone, just verify it's a valid YYYY-MM-DD format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should return null for invalid date string", () => {
      expect(toDateKey("invalid-date")).toBeNull();
    });

    it("should trim whitespace and return date key", () => {
      expect(toDateKey("  2024-01-15  ")).toBe("2024-01-15");
    });
  });

  describe("buildDateRange", () => {
    it("should return correct start and end dates from array", () => {
      const values = [
        { date: "2024-01-01" },
        { date: "2024-01-15" },
        { date: "2024-01-31" },
      ];
      const result = buildDateRange(values);
      expect(result.startDate).toBe("2024-01-01");
      expect(result.endDate).toBe("2024-01-31");
    });

    it("should use current date as fallback for empty array", () => {
      const result = buildDateRange([]);
      expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it("should use same date for start and end with single item", () => {
      const values = [{ date: "2024-01-15" }];
      const result = buildDateRange(values);
      expect(result.startDate).toBe("2024-01-15");
      expect(result.endDate).toBe("2024-01-15");
    });
  });

  describe("normalizeToScale", () => {
    it("should return 50 when range is zero or negative", () => {
      expect(normalizeToScale(100, 0, 0)).toBe(50);
      expect(normalizeToScale(100, 0, -10)).toBe(50);
    });

    it("should return 50 for midpoint value", () => {
      expect(normalizeToScale(100, 0, 200)).toBe(50);
    });

    it("should return 100 for minimum value", () => {
      expect(normalizeToScale(0, 0, 100)).toBe(100);
    });
  });
});
