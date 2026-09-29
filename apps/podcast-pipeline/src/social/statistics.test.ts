import { describe, expect, it } from 'vitest';

import { median } from './statistics.js';

describe('median', () => {
  it('returns zero for an empty sample', () => {
    expect(median([])).toBe(0);
  });

  it('returns the middle value for an odd sample', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values for an even sample', () => {
    expect(median([1, 4, 2, 3])).toBe(2.5);
  });
});
