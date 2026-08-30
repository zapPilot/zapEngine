import { humanizeSlug } from '../../../src/shared/string.js';
import { describe, expect, it } from 'vitest';

describe('humanizeSlug', () => {
  it('normalizes underscore- and hyphen-delimited identifiers', () => {
    expect(humanizeSlug('ETH_BTC-ratio')).toBe('Eth btc ratio');
  });

  it('prefers a supplied label', () => {
    expect(humanizeSlug('stable', { stable: 'Cash' })).toBe('Cash');
  });

  it('ignores inherited Object properties when no label matches', () => {
    expect(humanizeSlug('constructor')).toBe('Constructor');
    expect(humanizeSlug('toString')).toBe('Tostring');
  });

  it('uses the requested fallback for empty identifiers', () => {
    expect(humanizeSlug('---', {}, 'Unknown')).toBe('Unknown');
  });
});
