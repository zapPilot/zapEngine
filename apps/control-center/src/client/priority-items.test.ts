import { describe, expect, it } from 'vitest';

import type { OperationalPriority } from '../shared/types.js';
import { priorityItems } from './priority-items.js';

function priority(fingerprint: string): OperationalPriority {
  return {
    reasons: ['critical status'],
    score: 90,
    signal: {
      detail: 'queue is backing up',
      domain: 'pipeline',
      evidence: {},
      fingerprint,
      observedAt: '2026-09-10T00:00:00.000Z',
      source: 'social-queue',
      status: 'critical',
      title: `Signal ${fingerprint}`,
      url: 'https://example.com/run/1',
    },
  };
}

describe('priorityItems', () => {
  it('maps ranked signals without detail or source links by default', () => {
    const [item] = priorityItems([priority('a')]);

    expect(item?.id).toBe('a');
    expect(item?.title).toBe('Signal a');
    expect(item?.tone).toBe('danger');
    expect(item?.detail).toBeUndefined();
    expect(item?.aside).toBeUndefined();
    expect(item?.meta).toBeDefined();
  });

  it('attaches detail text and a source link when asked', () => {
    const [item] = priorityItems([priority('a')], {
      detail: true,
      sourceLink: true,
    });

    expect(item?.detail).toBe('queue is backing up');
    expect(item?.aside).toBeDefined();
  });

  it('maps an empty ranking to an empty list', () => {
    expect(priorityItems([])).toEqual([]);
  });
});
