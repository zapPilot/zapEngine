/**
 * Unit tests for env utilities
 */
import { describe, expect, it } from "vitest";

import { toSeconds } from "@/lib/utils/env";

describe("env", () => {
  describe("toSeconds", () => {
    it("should return fallback for undefined value", () => {
      expect(toSeconds(undefined, 3600)).toBe(3600);
    });

    it("should return fallback for empty string", () => {
      expect(toSeconds("", 3600)).toBe(3600);
    });

    it("should parse valid number string", () => {
      expect(toSeconds("7200", 3600)).toBe(7200);
    });

    it("should parse zero correctly", () => {
      expect(toSeconds("0", 3600)).toBe(0);
    });

    it("should parse negative numbers", () => {
      expect(toSeconds("-100", 3600)).toBe(-100);
    });

    it("should parse decimal numbers", () => {
      expect(toSeconds("3.14", 0)).toBe(3.14);
    });

    it("should return fallback for non-numeric string", () => {
      expect(toSeconds("not-a-number", 3600)).toBe(3600);
    });

    it("should return fallback for NaN", () => {
      expect(toSeconds("NaN", 3600)).toBe(3600);
    });

    it("should return fallback for Infinity", () => {
      expect(toSeconds("Infinity", 3600)).toBe(3600);
    });

    it("should return fallback for -Infinity", () => {
      expect(toSeconds("-Infinity", 3600)).toBe(3600);
    });
  });
});
