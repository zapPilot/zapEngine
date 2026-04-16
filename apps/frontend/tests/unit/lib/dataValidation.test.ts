/**
 * Comprehensive test suite for data validation utilities
 * Tests all conversion functions with valid inputs, edge cases, and fallback behavior
 */

import { describe, expect, it } from "vitest";

import { safeNumber } from "@/lib/validation/dataValidation";

describe("dataValidation", () => {
  describe("safeNumber", () => {
    it("should return valid number", () => {
      expect(safeNumber(123)).toBe(123);
      expect(safeNumber(0)).toBe(0);
      expect(safeNumber(-42)).toBe(-42);
    });

    it("should convert valid number string", () => {
      expect(safeNumber("123.45")).toBe(123.45);
    });

    it("should convert bigint", () => {
      expect(safeNumber(BigInt(100))).toBe(100);
    });

    it("should return undefined for null", () => {
      expect(safeNumber(null)).toBeUndefined();
    });

    it("should return undefined for undefined", () => {
      expect(safeNumber()).toBeUndefined();
    });

    it("should return undefined for NaN", () => {
      expect(safeNumber(NaN)).toBeUndefined();
    });

    it("should return undefined for Infinity", () => {
      expect(safeNumber(Infinity)).toBeUndefined();
      expect(safeNumber(-Infinity)).toBeUndefined();
    });

    it("should return undefined for invalid string", () => {
      expect(safeNumber("invalid")).toBeUndefined();
      expect(safeNumber("")).toBeUndefined();
    });
  });
});
