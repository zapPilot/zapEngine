import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../../../config/env.js';
import { inspectOperationalSignal } from './inspect.js';

describe('inspectOperationalSignal now fallback', () => {
  it('defaults inspectedAt to the current time when no clock is injected', async () => {
    const result = await inspectOperationalSignal({
      config: readControlCenterConfig({}),
      fingerprint: 'not-a-fingerprint',
      fetchImpl: async () => {
        throw new Error('must not fetch');
      },
    });

    expect(result.status).toBe('unsupported');
    expect(result.summary).toBe('Fingerprint must use source:kind/key form.');
    expect(Date.parse(result.inspectedAt)).toBeLessThanOrEqual(Date.now());
  });
});
