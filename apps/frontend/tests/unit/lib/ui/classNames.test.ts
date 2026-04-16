/**
 * classNames Utility Tests
 *
 * Tests for the cn utility function
 */

import { describe, expect, it } from "vitest";

import { cn } from "@/lib/ui/classNames";

describe("cn", () => {
  it("joins multiple class names", () => {
    expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
  });

  it("filters out undefined values", () => {
    expect(cn("foo", undefined, "bar")).toBe("foo bar");
  });

  it("filters out null values", () => {
    expect(cn("foo", null, "bar")).toBe("foo bar");
  });

  it("filters out false values", () => {
    expect(cn("foo", false, "bar")).toBe("foo bar");
  });

  it("filters out empty strings", () => {
    expect(cn("foo", "", "bar")).toBe("foo bar");
  });

  it("handles conditional class names", () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn("base", isActive && "active", isDisabled && "disabled")).toBe(
      "base active"
    );
  });

  it("returns empty string for no valid classes", () => {
    expect(cn(undefined, null, false)).toBe("");
  });

  it("returns single class for one input", () => {
    expect(cn("single")).toBe("single");
  });
});
