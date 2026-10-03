import { describe, expect, it } from 'vitest';

import { contactGrid, sampleFrames } from './contact-grid';

describe('contactGrid', () => {
  it('lays 16:9 tiles row by row with room for labels', () => {
    const grid = contactGrid(5, 4, 320, 40, 10);
    expect(grid.tiles[0]).toEqual({
      left: 10,
      top: 10,
      width: 320,
      height: 180,
    });
    expect(grid.tiles[3]).toMatchObject({ left: 10 + 3 * 330, top: 10 });
    expect(grid.tiles[4]).toMatchObject({ left: 10, top: 10 + 180 + 40 + 10 });
    expect(grid.width).toBe(10 + 4 * 330);
    expect(grid.height).toBe(10 + 2 * (180 + 40 + 10));
  });

  it('defaults the label band and gap', () => {
    expect(contactGrid(1, 1, 160).height).toBe(16 + 90 + 40 + 16);
  });
});

describe('sampleFrames', () => {
  it('samples each scene at fractions of its own length, inside the scene', () => {
    expect(
      sampleFrames(
        [
          { from: 0, durationInFrames: 100 },
          { from: 90, durationInFrames: 50 },
        ],
        [0, 0.5, 1],
      ),
    ).toEqual([
      [0, 50, 99],
      [90, 115, 139],
    ]);
  });
});
