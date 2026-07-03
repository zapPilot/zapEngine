import { describe, expect, it } from 'vitest';

import { parseDepositDefaultSplit } from '../../../../src/modules/plan-orchestration/module';

describe('parseDepositDefaultSplit', () => {
  it('parses a valid JSON split into numeric chain keys', () => {
    expect(parseDepositDefaultSplit('{"8453":0.7,"1337":0.3}')).toEqual({
      8453: 0.7,
      1337: 0.3,
    });
  });

  it('parses the Base-only rollback value', () => {
    expect(parseDepositDefaultSplit('{"8453":1}')).toEqual({ 8453: 1 });
  });

  it('throws on malformed JSON so the container fails fast', () => {
    expect(() => parseDepositDefaultSplit('{8453:0.7}')).toThrow(
      /DEPOSIT_DEFAULT_SPLIT is not valid JSON/,
    );
  });

  it('throws on non-numeric keys', () => {
    expect(() => parseDepositDefaultSplit('{"base":1}')).toThrow(
      /DEPOSIT_DEFAULT_SPLIT is invalid/,
    );
  });

  it('throws on non-positive weights', () => {
    expect(() => parseDepositDefaultSplit('{"8453":0}')).toThrow(
      /DEPOSIT_DEFAULT_SPLIT is invalid/,
    );
  });
});
