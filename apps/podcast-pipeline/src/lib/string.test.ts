import { describe, expect, it } from 'vitest';

import { readNullableString, readString } from './string.js';

describe('readString', () => {
  it.each([
    ['  hi  ', 'hi'],
    [42, ''],
    [null, ''],
    [undefined, ''],
  ])('normalizes %s', (value, expected) => {
    expect(readString(value)).toBe(expected);
  });
});

describe('readNullableString', () => {
  it.each([
    ['  hi ', 'hi'],
    ['   ', null],
    [42, null],
    ['x', 'x'],
  ])('normalizes %s', (value, expected) => {
    expect(readNullableString(value)).toBe(expected);
  });
});
