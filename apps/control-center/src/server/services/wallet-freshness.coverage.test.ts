import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';

const createServiceRoleClient = vi.hoisted(() => vi.fn());

vi.mock('./supabase.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase.js')>();
  return { ...actual, createServiceRoleClient };
});

import {
  loadPriorityWalletCoverage,
  walletFreshness,
} from './wallet-freshness.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

describe('wallet freshness malformed entries', () => {
  it('treats a non-object source entry as never refreshed', () => {
    expect(
      walletFreshness(
        {
          last_portfolio_update_at: '2026-08-28T11:00:00.000Z',
          source_states: {
            debank: 'oops',
            hyperliquid: { last_success_at: '2026-08-28T11:00:00.000Z' },
          },
        },
        NOW,
      ),
    ).toEqual({ ageHours: 1, neverRefreshed: true });
  });

  it('treats a null source entry as never refreshed', () => {
    expect(
      walletFreshness(
        {
          last_portfolio_update_at: '2026-08-28T11:00:00.000Z',
          source_states: { debank: null },
        },
        NOW,
      ),
    ).toEqual({ ageHours: null, neverRefreshed: true });
  });

  it('treats a numeric source entry as never refreshed', () => {
    expect(
      walletFreshness(
        {
          last_portfolio_update_at: '2026-08-28T11:00:00.000Z',
          source_states: { debank: 42 },
        },
        NOW,
      ),
    ).toEqual({ ageHours: null, neverRefreshed: true });
  });
});

describe('loadPriorityWalletCoverage null-data branch', () => {
  it('treats a null payload as an empty fleet', async () => {
    const createSupabaseClient = () =>
      ({
        rpc: () => Promise.resolve({ data: null, error: null }),
      }) as unknown as ReturnType<
        typeof import('./wallet-freshness.js').createSchemaClient
      >;

    await expect(
      loadPriorityWalletCoverage({
        config: CONFIGURED,
        now: NOW,
        createSupabaseClient,
      }),
    ).resolves.toEqual({ expected: 0, fresh: 0, stale: 0, neverRefreshed: 0 });
  });

  it('uses the default client factory when none is injected', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    createServiceRoleClient.mockReturnValue({ rpc });

    await expect(
      loadPriorityWalletCoverage({ config: CONFIGURED, now: NOW }),
    ).resolves.toEqual({ expected: 0, fresh: 0, stale: 0, neverRefreshed: 0 });
    expect(createServiceRoleClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-key',
      'public',
    );
    expect(rpc).toHaveBeenCalledWith('get_user_service_states');
  });
});
