import { describe, expect, it } from 'vitest';

import { isRecord } from './typeGuards.js';

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for primitives and arrays-vs-objects edge cases', () => {
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    // Arrays are objects in JS — the guard intentionally accepts them
    // (matches existing call sites that index by string key).
    expect(isRecord([])).toBe(true);
  });
});
