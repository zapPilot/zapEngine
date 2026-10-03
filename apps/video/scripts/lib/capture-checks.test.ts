import { describe, expect, it } from 'vitest';

import { evaluateCheck } from './capture-checks';

const seen = {
  text: '  Codehash   matches\nat block 315 ',
  value: null,
  pressed: null,
};

describe('evaluateCheck', () => {
  it('compares visible text with whitespace normalised', () => {
    expect(
      evaluateCheck({ selector: 's', contains: 'matches at  block' }, seen),
    ).toEqual({
      passed: ['s: text containing "matches at block"'],
      failures: [],
      values: {},
    });
    expect(
      evaluateCheck({ selector: 's', contains: 'mismatch' }, seen).failures,
    ).toEqual([
      's: expected text containing "mismatch", saw "Codehash matches at block 315"',
    ]);
  });

  it('compares input values', () => {
    expect(
      evaluateCheck({ selector: 'i', value: '1.5' }, { ...seen, value: '1.5' })
        .passed,
    ).toEqual(['i: value "1.5"']);
    expect(
      evaluateCheck({ selector: 'i', value: '1.5' }, seen).failures,
    ).toEqual(['i: expected value "1.5", saw "(no value)"']);
  });

  it('compares aria-pressed', () => {
    expect(
      evaluateCheck(
        { selector: 'b', pressed: true },
        { ...seen, pressed: 'true' },
      ).passed,
    ).toEqual(['b: aria-pressed=true']);
    expect(
      evaluateCheck({ selector: 'b', pressed: false }, seen).failures,
    ).toEqual(['b: expected aria-pressed=false, saw aria-pressed=(absent)']);
  });

  it('records the first group of a pattern', () => {
    expect(
      evaluateCheck(
        { selector: 's', record: { name: 'block', pattern: 'block (\\d+)' } },
        seen,
      ),
    ).toEqual({
      passed: ['s: block=315'],
      failures: [],
      values: { block: '315' },
    });
    expect(
      evaluateCheck(
        { selector: 's', record: { name: 'tx', pattern: 'tx (\\w+)' } },
        seen,
      ).failures,
    ).toEqual(['s: expected /tx (\\w+)/, saw "Codehash matches at block 315"']);
  });
});
