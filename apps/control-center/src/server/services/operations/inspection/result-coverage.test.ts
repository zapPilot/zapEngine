import { describe, expect, it } from 'vitest';

import {
  messageOf,
  unavailableInspection,
  unsupportedInspection,
} from './result.js';

describe('inspection result coverage', () => {
  it('formats a non-Error failure without losing the value', () => {
    expect(messageOf('plain-string-failure')).toBe('plain-string-failure');
    expect(messageOf(new Error('wrapped'))).toBe('wrapped');
  });

  it('defaults missing entities and evidence to empty collections', () => {
    const inspectedAt = new Date('2026-08-30T10:00:00.000Z');
    const result = unsupportedInspection({
      fingerprint: 'sentry:issues/alpha-etl',
      source: 'sentry',
      inspectedAt,
      summary: 'not supported here',
    });

    expect(result.entities).toEqual([]);
    expect(result.evidence).toEqual({});
    expect(result.gaps).toEqual([]);
  });

  it('carries the provider reason as an evidence gap for unavailable reads', () => {
    const inspectedAt = new Date('2026-08-30T10:00:00.000Z');
    const result = unavailableInspection({
      fingerprint: 'fly:app/alpha-etl',
      source: 'fly',
      inspectedAt,
      summary: 'Deep inspection failed: boom',
      reason: 'boom',
    });

    expect(result.status).toBe('unavailable');
    expect(result.gaps).toEqual([{ source: 'fly', reason: 'boom' }]);
  });
});
