import { describe, expect, it } from 'vitest';

import { messageOf, unsupported } from './helpers.js';

describe('inspection helpers coverage', () => {
  it('formats a non-Error rejection without losing the value', () => {
    expect(messageOf('boom')).toBe('boom');
    expect(messageOf(42)).toBe('42');
    expect(messageOf(new Error('wrapped'))).toBe('wrapped');
  });

  it('builds an unsupported inspection with empty evidence gaps', () => {
    const inspectedAt = new Date('2026-08-30T10:00:00.000Z');
    const result = unsupported(
      { fingerprint: 'fly:app/alpha-etl', inspectedAt },
      'Fly inspection does not support kind.',
      'fly',
    );

    expect(result).toMatchObject({
      fingerprint: 'fly:app/alpha-etl',
      source: 'fly',
      status: 'unsupported',
      summary: 'Fly inspection does not support kind.',
    });
    expect(result.gaps).toEqual([]);
  });
});
