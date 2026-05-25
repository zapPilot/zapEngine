import { describe, expect, it } from 'vitest';

import { portSchema } from '../../../src/shared/env.js';

describe('portSchema', () => {
  it('accepts a valid numeric port', () => {
    expect(portSchema.parse(3000)).toBe(3000);
  });

  it('coerces a numeric string to a number', () => {
    expect(portSchema.parse('8080')).toBe(8080);
  });

  it('accepts the boundary ports 1 and 65535', () => {
    expect(portSchema.parse(1)).toBe(1);
    expect(portSchema.parse(65535)).toBe(65535);
  });

  it('rejects ports below 1', () => {
    expect(() => portSchema.parse(0)).toThrow();
    expect(() => portSchema.parse(-1)).toThrow();
  });

  it('rejects ports above 65535', () => {
    expect(() => portSchema.parse(65536)).toThrow();
  });

  it('rejects non-integer ports', () => {
    expect(() => portSchema.parse(80.5)).toThrow();
  });

  it('rejects strings that do not coerce to a number', () => {
    expect(() => portSchema.parse('not-a-port')).toThrow();
  });
});
