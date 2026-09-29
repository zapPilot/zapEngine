import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../../config/env.js';
import { inspectFlySignal } from './fly.js';

const NOW = new Date('2026-09-10T00:00:00.000Z');

describe('inspectFlySignal missing timestamps', () => {
  it('sorts machines with no timestamps via the empty-string fallback', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'm-none-1',
            state: 'started',
            region: 'iad',
            config: { metadata: {} },
          },
          {
            id: 'm-none-2',
            state: 'started',
            region: 'iad',
            config: { metadata: {} },
          },
        ]),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await inspectFlySignal({
      config: readControlCenterConfig({ FLY_OPS_TOKEN: 'token' }),
      fingerprint: 'fly:app/my-app',
      parsed: { source: 'fly', kind: 'app', key: 'my-app' },
      inspectedAt: NOW,
      fetchImpl,
    });

    expect(result.status).toBe('ok');
    expect(result.summary).toBe('my-app: 2 Machines inspected.');
  });
});
