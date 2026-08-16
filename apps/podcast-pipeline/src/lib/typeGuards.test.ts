import { describe, expect, it } from 'vitest';

import { isPlainRecord, isRecord, nonemptyString } from './typeGuards.js';

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

describe('isPlainRecord', () => {
  it('rejects arrays while accepting plain objects', () => {
    expect(isPlainRecord({ a: 1 })).toBe(true);
    expect(isPlainRecord([])).toBe(false);
  });
});

describe('nonemptyString', () => {
  it('returns trimmed non-empty strings only', () => {
    expect(nonemptyString('  value  ')).toBe('value');
    expect(nonemptyString('   ')).toBeUndefined();
    expect(nonemptyString(42)).toBeUndefined();
  });
});
