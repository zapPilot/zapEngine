import { describe, expect, it } from "vitest";

import { buildPath, CHART_GRID_POSITIONS } from "@/lib/ui/chartPrimitives";

describe("buildPath", () => {
  it("returns a single coordinate for one point", () => {
    const points = [{ x: 50, value: 100 }];
    const result = buildPath(points, 200, p => p.value);
    expect(result).toBe("100,100");
  });

  it("joins multiple points with ' L '", () => {
    const points = [
      { x: 0, value: 0 },
      { x: 100, value: 50 },
    ];
    const result = buildPath(points, 100, p => p.value);
    expect(result).toBe("0,0 L 100,50");
  });

  it("scales x correctly relative to width", () => {
    const points = [{ x: 25, value: 10 }];
    const result = buildPath(points, 400, p => p.value);
    // 25% of 400 = 100
    expect(result).toBe("100,10");
  });

  it("returns empty string for empty points array", () => {
    const result = buildPath([], 200, () => 0);
    expect(result).toBe("");
  });

  it("handles three points correctly", () => {
    const points = [
      { x: 0, value: 0 },
      { x: 50, value: 25 },
      { x: 100, value: 50 },
    ];
    const result = buildPath(points, 100, p => p.value);
    expect(result).toBe("0,0 L 50,25 L 100,50");
  });

  it("works with custom getY function", () => {
    const points = [{ x: 50, height: 200 }];
    // getY inverts the height by subtracting from 300
    const result = buildPath(points, 200, p => 300 - p.height);
    expect(result).toBe("100,100");
  });
});

describe("CHART_GRID_POSITIONS", () => {
  it("FIVE_LINES has 5 positions", () => {
    expect(CHART_GRID_POSITIONS.FIVE_LINES).toHaveLength(5);
    expect(CHART_GRID_POSITIONS.FIVE_LINES).toEqual([0, 25, 50, 75, 100]);
  });

  it("FOUR_LINES has 4 positions", () => {
    expect(CHART_GRID_POSITIONS.FOUR_LINES).toHaveLength(4);
    expect(CHART_GRID_POSITIONS.FOUR_LINES).toEqual([0, 33, 66, 100]);
  });

  it("THREE_LINES has 3 positions", () => {
    expect(CHART_GRID_POSITIONS.THREE_LINES).toHaveLength(3);
    expect(CHART_GRID_POSITIONS.THREE_LINES).toEqual([0, 50, 100]);
  });

  it("all position arrays start at 0 and end at 100", () => {
    for (const lines of Object.values(CHART_GRID_POSITIONS)) {
      expect(lines[0]).toBe(0);
      expect(lines[lines.length - 1]).toBe(100);
    }
  });
});
