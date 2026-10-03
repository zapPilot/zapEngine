import { describe, expect, it } from 'vitest';

import { scrambleText, settledLength } from './scramble';

describe('scrambleText', () => {
  const hash = '0xc34735d87c23ebd0';

  it('reads the target once settled and keeps the 0x prefix throughout', () => {
    expect(scrambleText(hash, 1, 7)).toBe(hash);
    expect(scrambleText(hash, 0, 7).startsWith('0x')).toBe(true);
  });

  it('keeps separators and the character classes of what it hides', () => {
    const noise = scrambleText('106,443.61 X', 0, 3);
    expect(noise[3]).toBe(',');
    expect(noise[7]).toBe('.');
    expect(noise.slice(-2)).toBe(' X');
    expect(noise.slice(0, 3)).toMatch(/^\d{3}$/);
  });

  it('mirrors the case of hex letters', () => {
    expect(scrambleText('ABCDEF', 0, 1)).toMatch(/^[0-9A-F]{6}$/);
    expect(scrambleText('abcdef', 0, 1)).toMatch(/^[0-9a-f]{6}$/);
  });

  it('is deterministic per seed and changes with it', () => {
    expect(scrambleText('1234567890', 0, 5)).toBe(
      scrambleText('1234567890', 0, 5),
    );
    expect(scrambleText('1234567890', 0, 5)).not.toBe(
      scrambleText('1234567890', 0, 6),
    );
  });
});

describe('settledLength', () => {
  it('settles left to right and clamps progress', () => {
    expect(settledLength('12345678', 0.5)).toBe(4);
    expect(settledLength('12345678', -1)).toBe(0);
    expect(settledLength('12345678', 9)).toBe(8);
    expect(settledLength('0xabcd', 0)).toBe(2);
  });
});
