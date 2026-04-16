/**
 * severityColors - Unit Tests
 *
 * Tests for severity-based color system and metric mappers.
 */

import { describe, expect, it } from "vitest";

import { getColorForSeverity, severityMappers } from "@/lib/ui/severityColors";

describe("getColorForSeverity", () => {
  it("should return green colors for excellent", () => {
    const result = getColorForSeverity("excellent");
    expect(result.color).toBe("text-green-400");
    expect(result.bgColor).toBe("bg-green-500/20");
  });

  it("should return lime colors for good", () => {
    const result = getColorForSeverity("good");
    expect(result.color).toBe("text-lime-400");
    expect(result.bgColor).toBe("bg-lime-500/20");
  });

  it("should return yellow colors for fair", () => {
    const result = getColorForSeverity("fair");
    expect(result.color).toBe("text-yellow-400");
    expect(result.bgColor).toBe("bg-yellow-500/20");
  });

  it("should return orange colors for poor", () => {
    const result = getColorForSeverity("poor");
    expect(result.color).toBe("text-orange-400");
    expect(result.bgColor).toBe("bg-orange-500/20");
  });

  it("should return red colors for critical", () => {
    const result = getColorForSeverity("critical");
    expect(result.color).toBe("text-red-400");
    expect(result.bgColor).toBe("bg-red-500/20");
  });
});

describe("severityMappers", () => {
  it.each([
    [-3, "excellent"],
    [-4.9, "excellent"],
    [-5, "fair"],
    [-9, "fair"],
    [-10, "poor"],
    [-19, "poor"],
    [-20, "critical"],
    [-50, "critical"],
  ])("drawdown(%d) → %s", (value, expected) => {
    expect(severityMappers.drawdown(value)).toBe(expected);
  });

  it.each([
    [2.0, "excellent"],
    [3.5, "excellent"],
    [1.0, "good"],
    [1.9, "good"],
    [0.5, "fair"],
    [0.9, "fair"],
    [0, "poor"],
    [0.4, "poor"],
    [-0.1, "critical"],
    [-1, "critical"],
  ])("sharpe(%d) → %s", (value, expected) => {
    expect(severityMappers.sharpe(value)).toBe(expected);
  });

  it.each([
    [10, "excellent"],
    [19, "excellent"],
    [20, "good"],
    [39, "good"],
    [40, "fair"],
    [59, "fair"],
    [60, "poor"],
    [84, "poor"],
    [85, "critical"],
    [100, "critical"],
  ])("volatility(%d) → %s", (value, expected) => {
    expect(severityMappers.volatility(value)).toBe(expected);
  });

  it.each([
    [-1, "excellent"],
    [-1.9, "excellent"],
    [-2, "good"],
    [-4.9, "good"],
    [-5, "fair"],
    [-9.9, "fair"],
    [-10, "poor"],
    [-14.9, "poor"],
    [-15, "critical"],
    [-30, "critical"],
  ])("underwater(%d) → %s", (value, expected) => {
    expect(severityMappers.underwater(value)).toBe(expected);
  });
});
