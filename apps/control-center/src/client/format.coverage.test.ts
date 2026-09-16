import { describe, expect, it } from 'vitest';

import { compactError, unitUsd } from './format.js';

describe('format coverage', () => {
  it('truncates a long error to one line with an ellipsis', () => {
    const long = `line one\n  line   two\n${'x'.repeat(400)}`;
    const compacted = compactError(long);

    expect(compacted).not.toContain('\n');
    expect(compacted).not.toContain('  ');
    expect(compacted.length).toBe(278);
    expect(compacted.endsWith('…')).toBe(true);
  });

  it('keeps a short error on one line without truncation', () => {
    expect(compactError('  fetch   failed\nretry  ')).toBe(
      'fetch failed retry',
    );
    expect(compactError('boom')).toBe('boom');
  });

  it('formats unit money with up to four fraction digits', () => {
    expect(unitUsd(1.5)).toBe('$1.50');
    expect(unitUsd(null)).toBe('—');
  });
});
