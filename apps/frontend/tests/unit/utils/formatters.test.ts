/**
 * formatters - Unit Tests
 *
 * Tests for formatting utilities (currency, numbers, addresses, dates).
 */

import dayjs from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  calculateDataFreshness,
  formatAddress,
  formatChartDate,
  formatCurrency,
  formatNumber,
  formatRelativeTime,
  formatters,
} from "@/utils/formatters";
import { logger } from "@/utils/logger";

describe("formatCurrency", () => {
  describe("Basic formatting", () => {
    it("should format positive amounts", () => {
      expect(formatCurrency(1234.56)).toBe("$1,234.56");
    });

    it("should format negative amounts", () => {
      expect(formatCurrency(-500)).toBe("-$500.00");
    });

    it("should format zero", () => {
      expect(formatCurrency(0)).toBe("$0.00");
    });

    it("should format large amounts", () => {
      expect(formatCurrency(1000000)).toBe("$1,000,000.00");
    });
  });

  describe("Hidden placeholder", () => {
    it("should return placeholder when isHidden is true (legacy boolean)", () => {
      const result = formatCurrency(1234, true);
      expect(result).toBe("••••••••");
    });

    it("should return placeholder when options.isHidden is true", () => {
      const result = formatCurrency(1234, { isHidden: true });
      expect(result).toBe("••••••••");
    });
  });

  describe("Custom options", () => {
    it("should respect minimumFractionDigits", () => {
      const result = formatCurrency(100, { minimumFractionDigits: 0 });
      expect(result).toBe("$100");
    });

    it("should respect maximumFractionDigits", () => {
      const result = formatCurrency(100.99, { maximumFractionDigits: 2 });
      expect(result).toBe("$100.99");
    });
  });

  describe("Smart precision mode", () => {
    it("should return $0.00 for zero amount", () => {
      const result = formatCurrency(0, { smartPrecision: true });
      expect(result).toBe("$0.00");
    });

    it("should show '< $0.01' for very small positive amounts", () => {
      const result = formatCurrency(0.005, { smartPrecision: true });
      expect(result).toBe("< $0.01");
    });

    it("should format small negative amounts", () => {
      const result = formatCurrency(-0.005, {
        smartPrecision: true,
        showNegative: true,
      });
      expect(result).toBe("-< $0.01");
    });

    it("should format amounts above threshold normally", () => {
      const result = formatCurrency(5.5, { smartPrecision: true });
      expect(result).toBe("$5.50");
    });

    it("should respect custom threshold", () => {
      const result = formatCurrency(0.0005, {
        smartPrecision: true,
        threshold: 0.001,
      });
      expect(result).toBe("< $0.0010");
    });

    it("uses default threshold (0.01) when threshold is explicitly undefined", () => {
      // Exercises the `options.threshold ?? 0.01` right branch.
      // normalizeFormatOptions spreads user options over defaults, so explicit
      // `undefined` overrides the default 0.01, making ?? fallback fire.
      const result = formatCurrency(0.005, {
        smartPrecision: true,
        threshold: undefined,
      });
      expect(result).toBe("< $0.01");
    });

    it("uses default showNegative (true) when showNegative is explicitly undefined", () => {
      // Exercises the `options.showNegative ?? true` right branch.
      const result = formatCurrency(-0.005, {
        smartPrecision: true,
        showNegative: undefined,
      });
      expect(result).toBe("-< $0.01");
    });
  });
});

describe("formatNumber", () => {
  describe("Basic formatting", () => {
    it("should format integers", () => {
      expect(formatNumber(1234)).toBe("1,234");
    });

    it("should format decimals", () => {
      expect(formatNumber(1234.5678)).toBe("1,234.5678");
    });
  });

  describe("Hidden placeholder", () => {
    it("should return placeholder when isHidden is true (legacy)", () => {
      const result = formatNumber(1234, true);
      expect(result).toBe("••••");
    });

    it("should return placeholder when options.isHidden is true", () => {
      const result = formatNumber(1234, { isHidden: true });
      expect(result).toBe("••••");
    });
  });

  describe("Smart precision mode", () => {
    it("should return '0' for zero", () => {
      expect(formatNumber(0, { smartPrecision: true })).toBe("0");
    });

    it("should return '< 0.000001' for very tiny values", () => {
      expect(formatNumber(0.0000001, { smartPrecision: true })).toBe(
        "< 0.000001"
      );
    });

    it("should format tiny values with 6 decimals", () => {
      expect(formatNumber(0.005, { smartPrecision: true })).toBe("0.005000");
    });

    it("should format small values with 4 decimals", () => {
      expect(formatNumber(0.5, { smartPrecision: true })).toBe("0.5000");
    });

    it("should format medium values with 2 decimals", () => {
      expect(formatNumber(50, { smartPrecision: true })).toBe("50.00");
    });

    it("should format large values with 0 decimals", () => {
      expect(formatNumber(150, { smartPrecision: true })).toBe("150");
    });
  });

  describe("Custom options", () => {
    it("should respect maximumFractionDigits", () => {
      const result = formatNumber(1.23456, { maximumFractionDigits: 2 });
      expect(result).toBe("1.23");
    });
  });
});

describe("formatAddress", () => {
  it("should shorten long addresses", () => {
    const result = formatAddress("0x1234567890abcdef1234567890abcdef12345678");
    expect(result).toBe("0x1234...5678");
  });

  it("should return empty string for null", () => {
    expect(formatAddress(null)).toBe("");
  });

  it("should return empty string for undefined", () => {
    expect(formatAddress(undefined)).toBe("");
  });

  it("should return empty string for empty string input", () => {
    expect(formatAddress("")).toBe("");
  });

  it("should return empty string for whitespace-only input", () => {
    expect(formatAddress("   ")).toBe("");
  });

  it("should return short address unchanged", () => {
    expect(formatAddress("0x1234")).toBe("0x1234");
  });

  it("should respect custom prefix/suffix lengths", () => {
    const result = formatAddress("0x1234567890abcdef1234567890abcdef12345678", {
      prefixLength: 10,
      suffixLength: 8,
    });
    expect(result).toBe("0x12345678...12345678");
  });

  it("should respect custom ellipsis", () => {
    const result = formatAddress("0x1234567890abcdef1234567890abcdef12345678", {
      ellipsis: "…",
    });
    expect(result).toBe("0x1234…5678");
  });
});

describe("formatChartDate", () => {
  it("should format date string", () => {
    const result = formatChartDate("2024-01-15");
    expect(result).toMatch(/Jan 15, 2024/);
  });

  it("should format Date object", () => {
    const result = formatChartDate(new Date("2024-06-20"));
    expect(result).toMatch(/Jun 20, 2024/);
  });

  it("should return original string for invalid date string", () => {
    expect(formatChartDate("invalid")).toBe("invalid");
  });

  it("should return empty string for invalid Date object", () => {
    expect(formatChartDate(new Date("invalid"))).toBe("");
  });
});

describe("formatters object", () => {
  it("should format currency rounded to dollars", () => {
    expect(formatters.currency(1234.56)).toBe("$1,235");
  });

  it("should format percentage", () => {
    expect(formatters.percent(25.5)).toBe("25.5%");
    expect(formatters.percent(10, 2)).toBe("10.00%");
  });

  it("should have chartDate alias", () => {
    expect(formatters.chartDate).toBe(formatChartDate);
  });

  it("should have number alias", () => {
    expect(formatters.number).toBe(formatNumber);
  });

  it("should have dataFreshness alias", () => {
    expect(formatters.dataFreshness).toBe(calculateDataFreshness);
  });

  it("should have relativeTime alias", () => {
    expect(formatters.relativeTime).toBe(formatRelativeTime);
  });
});

describe("calculateDataFreshness", () => {
  beforeEach(() => {
    // Mock current time to 2025-12-29T12:00:00Z for consistent tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-29T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Fresh state (<24h)", () => {
    it("should classify recent data as fresh", () => {
      const yesterday = "2025-12-28T12:00:00Z";
      const result = calculateDataFreshness(yesterday);

      expect(result.state).toBe("fresh");
      expect(result.isCurrent).toBe(true);
      expect(result.hoursSince).toBe(24);
    });

    it("should show relative time for fresh data", () => {
      const recentTime = "2025-12-29T10:00:00Z";
      const result = calculateDataFreshness(recentTime);

      expect(result.state).toBe("fresh");
      expect(result.relativeTime).toContain("ago");
    });
  });

  describe("Stale state (24-72h)", () => {
    it("should classify 2-day-old data as stale", () => {
      const twoDaysAgo = "2025-12-27T12:00:00Z";
      const result = calculateDataFreshness(twoDaysAgo);

      expect(result.state).toBe("stale");
      expect(result.isCurrent).toBe(false);
      expect(result.hoursSince).toBe(48);
    });

    it("should classify 3-day-old data as stale", () => {
      const threeDaysAgo = "2025-12-26T12:00:00Z";
      const result = calculateDataFreshness(threeDaysAgo);

      expect(result.state).toBe("stale");
    });
  });

  describe("Very stale state (>72h)", () => {
    it("should classify 4-day-old data as very-stale", () => {
      const fourDaysAgo = "2025-12-25T12:00:00Z";
      const result = calculateDataFreshness(fourDaysAgo);

      expect(result.state).toBe("very-stale");
      expect(result.isCurrent).toBe(false);
      expect(result.hoursSince).toBe(96);
    });

    it("should classify week-old data as very-stale", () => {
      const weekAgo = "2025-12-22T12:00:00Z";
      const result = calculateDataFreshness(weekAgo);

      expect(result.state).toBe("very-stale");
    });
  });

  describe("Unknown state", () => {
    it("should handle null gracefully", () => {
      const result = calculateDataFreshness(null);

      expect(result.state).toBe("unknown");
      expect(result.relativeTime).toBe("Unknown");
      expect(result.hoursSince).toBe(Infinity);
      expect(result.timestamp).toBe("");
      expect(result.isCurrent).toBe(false);
    });

    it("should handle undefined gracefully", () => {
      const result = calculateDataFreshness(undefined);

      expect(result.state).toBe("unknown");
      expect(result.relativeTime).toBe("Unknown");
    });

    it("should handle invalid date format", () => {
      const result = calculateDataFreshness("invalid-date");

      expect(result.state).toBe("unknown");
      expect(result.timestamp).toBe("invalid-date");
    });
  });

  describe("Edge cases", () => {
    it("should handle date-only format (YYYY-MM-DD)", () => {
      const dateOnly = "2025-12-28";
      const result = calculateDataFreshness(dateOnly);

      // Date-only format should parse successfully (state may vary by timezone)
      expect(result.state).not.toBe("unknown");
      expect(result.timestamp).toBe(dateOnly);
      expect(result.relativeTime).toContain("ago");
    });

    it("should return correct hoursSince value", () => {
      const sixHoursAgo = "2025-12-29T06:00:00Z";
      const result = calculateDataFreshness(sixHoursAgo);

      expect(result.hoursSince).toBe(6);
      expect(result.state).toBe("fresh");
    });
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-29T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should format recent time correctly", () => {
    const result = formatRelativeTime("2025-12-29T10:00:00Z");
    expect(result).toContain("ago");
  });

  it("should return 'Unknown' for null", () => {
    expect(formatRelativeTime(null)).toBe("Unknown");
  });

  it("should return 'Unknown' for undefined", () => {
    expect(formatRelativeTime(undefined)).toBe("Unknown");
  });

  it("should return 'Unknown' for invalid date", () => {
    expect(formatRelativeTime("invalid")).toBe("Unknown");
  });
});

describe("Exception Handling in Time Functions", () => {
  it("should catch errors in calculateDataFreshness", () => {
    // @ts-expect-error - Mocking dayjs.utc involves type mismatch with spyOn
    const utcSpy = vi.spyOn(dayjs, "utc").mockImplementation(() => {
      throw new Error("Dayjs Error");
    });
    const loggerSpy = vi
      .spyOn(logger, "error")
      .mockImplementation(() => undefined);

    const result = calculateDataFreshness("2024-01-01");

    expect(result.state).toBe("unknown");
    expect(loggerSpy).toHaveBeenCalledWith(
      "Error calculating data freshness",
      expect.any(Error),
      "formatters"
    );

    utcSpy.mockRestore();
  });

  it("should catch errors in formatRelativeTime", () => {
    // @ts-expect-error - Mocking dayjs.utc involves type mismatch with spyOn
    const utcSpy = vi.spyOn(dayjs, "utc").mockImplementation(() => {
      throw new Error("Dayjs Error");
    });

    expect(formatRelativeTime("2024-01-01")).toBe("Unknown");

    utcSpy.mockRestore();
  });
});
