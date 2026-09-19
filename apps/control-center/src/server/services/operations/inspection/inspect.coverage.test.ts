import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../../../config/env.js';
import { inspectOperationalSignal } from './inspect.js';

const NOW = new Date('2026-09-19T09:00:00.000Z');

describe('inspectOperationalSignal coverage', () => {
  it('rejects malformed fingerprints before selecting an inspector', async () => {
    const result = await inspectOperationalSignal({
      config: readControlCenterConfig({}),
      fingerprint: 'github-actions',
      now: () => NOW,
      fetchImpl: async () => {
        throw new Error('malformed fingerprints must not fetch');
      },
    });

    expect(result).toMatchObject({
      fingerprint: 'github-actions',
      source: null,
      status: 'unsupported',
      summary: 'Fingerprint must use source:kind/key form.',
    });
  });
});
