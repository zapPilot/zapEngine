import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { costRepositoryFake, supabaseFixedRow } from '../__fixtures__/cost.js';
import { collectCostSignals } from './costs.js';

const config = readControlCenterConfig({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});
const now = new Date('2026-08-28T12:00:00.000Z');

describe('collectCostSignals invalid snapshot timestamps', () => {
  it('skips a snapshot whose fetchedAt cannot be parsed when choosing the newest', async () => {
    const signals = await collectCostSignals({
      config,
      now,
      repository: costRepositoryFake({
        loadLatestProviders: vi.fn().mockResolvedValue([
          supabaseFixedRow({ fetchedAt: 'not-a-timestamp' }),
          supabaseFixedRow({
            fetchedAt: '2026-08-28T06:00:00.000Z',
          }),
        ]),
      }),
    });

    const age = signals.find(
      (signal) => signal.fingerprint === 'cost-ledger:snapshot-age/ledger',
    );
    expect(age?.status).toBe('healthy');
    expect(age?.evidence).toEqual({ staleHours: 6 });
  });

  it('prefers the newest snapshot instead of the last provider row', async () => {
    const signals = await collectCostSignals({
      config,
      now,
      repository: costRepositoryFake({
        loadLatestProviders: vi
          .fn()
          .mockResolvedValue([
            supabaseFixedRow({ fetchedAt: '2026-08-28T06:00:00.000Z' }),
            supabaseFixedRow({ fetchedAt: '2026-08-28T00:00:00.000Z' }),
          ]),
      }),
    });

    const age = signals.find(
      (signal) => signal.fingerprint === 'cost-ledger:snapshot-age/ledger',
    );
    expect(age?.evidence).toEqual({ staleHours: 6 });
  });
});
