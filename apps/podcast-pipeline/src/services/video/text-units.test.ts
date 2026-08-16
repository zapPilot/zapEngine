import { describe, expect, it } from 'vitest';

import { characterUnits, lineUnits, speakingUnits } from './text-units.js';

describe('text unit heuristics', () => {
  it('distinguishes ASCII, CJK, astral, and empty characters', () => {
    expect(characterUnits('A')).toBe(0.55);
    expect(characterUnits('中')).toBe(1);
    expect(characterUnits('😀')).toBe(1);
    expect(characterUnits('')).toBe(0.55);
  });

  it('adds line units across mixed scripts including an empty line', () => {
    expect(lineUnits('A中')).toBeCloseTo(1.55);
    expect(lineUnits('')).toBe(0);
  });

  it('weights Latin words and non-Latin glyphs while clamping empty speech', () => {
    expect(speakingUnits('two latin words')).toBeCloseTo(4.2);
    expect(speakingUnits('中文')).toBe(2);
    expect(speakingUnits('ETH 中文 123')).toBeCloseTo(4.8);
    expect(speakingUnits('   ')).toBe(1);
  });
});
