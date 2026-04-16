/**
 * mathUtils Tests
 *
 * Tests for mathematical utility functions
 */

import { describe, expect, it } from "vitest";

import { clamp, clampMin } from "@/utils/mathUtils";

describe("clamp", () => {
  it("returns value when within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("returns min when value is below minimum", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("returns max when value is above maximum", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns min when value equals min", () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it("returns max when value equals max", () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("works with negative ranges", () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
    expect(clamp(5, -10, -1)).toBe(-1);
  });

  it("works with decimal values", () => {
    expect(clamp(5.5, 0, 10)).toBe(5.5);
    expect(clamp(0.1, 0, 1)).toBeCloseTo(0.1);
  });
});

describe("clampMin", () => {
  it("returns value when above minimum", () => {
    expect(clampMin(5, 0)).toBe(5);
  });

  it("returns min when value is below minimum", () => {
    expect(clampMin(-5, 0)).toBe(0);
  });

  it("returns min when value equals min", () => {
    expect(clampMin(0, 0)).toBe(0);
  });

  it("works with negative minimums", () => {
    expect(clampMin(-5, -10)).toBe(-5);
    expect(clampMin(-15, -10)).toBe(-10);
  });

  it("is useful for ensuring non-negative values", () => {
    expect(clampMin(-100, 0)).toBe(0);
    expect(clampMin(100, 0)).toBe(100);
  });
});
