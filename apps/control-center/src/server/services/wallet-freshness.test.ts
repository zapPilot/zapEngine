import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  createSchemaClient,
  loadPriorityWalletCoverage,
  summarizeWalletCoverage,
  walletFreshness,
  type WalletFreshnessRow,
} from './wallet-freshness.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');

/**
 * The rows worth testing differ only in their stamps, so the payload shape
 * lives in one place: a `last_success_at` per provider beside the legacy
 * column the reading is supposed to outrank.
 */
function sourced(
  lastPortfolioUpdateAt: string | null,
  sources: Record<string, string | null>,
): WalletFreshnessRow {
  return {
    last_portfolio_update_at: lastPortfolioUpdateAt,
    source_states: Object.fromEntries(
      Object.entries(sources).map(([name, at]) => [
        name,
        { last_success_at: at },
      ]),
    ),
  };
}

describe('walletFreshness', () => {
  it('reads the legacy column when the database has no per-source state', () => {
    expect(
      walletFreshness(
        { last_portfolio_update_at: '2026-08-28T10:00:00.000Z' },
        NOW,
      ),
    ).toEqual({ ageHours: 2, neverRefreshed: false });
  });

  it('reports a wallet nothing has ever refreshed as ageless, not as fresh', () => {
    expect(walletFreshness({ last_portfolio_update_at: null }, NOW)).toEqual({
      ageHours: null,
      neverRefreshed: true,
    });
  });

  it('takes the stalest source, so a live provider cannot cover a dead one', () => {
    expect(
      walletFreshness(
        sourced('2026-08-28T11:00:00.000Z', {
          debank: '2026-08-28T11:00:00.000Z',
          hyperliquid: '2026-08-25T12:00:00.000Z',
        }),
        NOW,
      ),
    ).toEqual({ ageHours: 72, neverRefreshed: false });
  });

  it('flags a source that has never landed even when its sibling is current', () => {
    expect(
      walletFreshness(
        sourced('2026-08-28T11:00:00.000Z', {
          debank: '2026-08-28T11:00:00.000Z',
          hyperliquid: null,
        }),
        NOW,
      ),
    ).toEqual({ ageHours: 1, neverRefreshed: true });
  });

  it('outranks the legacy column whenever per-source state exists', () => {
    expect(
      walletFreshness(
        sourced('2026-01-01T00:00:00.000Z', {
          debank: '2026-08-28T09:00:00.000Z',
          hyperliquid: '2026-08-28T10:00:00.000Z',
        }),
        NOW,
      ),
    ).toEqual({ ageHours: 3, neverRefreshed: false });
  });

  // A payload we cannot read must not read as "no sources are stale". Each of
  // these shapes falls back to the legacy column, which is narrower than the
  // truth but never quieter than it.
  it.each([
    ['an array', [{ last_success_at: null }]],
    ['a string', 'debank'],
    ['an empty object', {}],
    ['null', null],
  ])('falls back to the legacy column when source_states is %s', (_, value) => {
    expect(
      walletFreshness(
        {
          last_portfolio_update_at: '2026-08-28T08:00:00.000Z',
          source_states: value,
        },
        NOW,
      ),
    ).toEqual({ ageHours: 4, neverRefreshed: false });
  });

  it('treats an entry without a last_success_at as never refreshed', () => {
    expect(
      walletFreshness(
        {
          last_portfolio_update_at: '2026-08-28T11:00:00.000Z',
          source_states: {
            debank: { last_attempt_at: '2026-08-28T11:00:00Z' },
          },
        },
        NOW,
      ),
    ).toEqual({ ageHours: null, neverRefreshed: true });
  });
});

describe('summarizeWalletCoverage', () => {
  function priority(sources: Record<string, string | null>) {
    return { ...sourced(null, sources), effective_tier: 'priority' };
  }

  const fresh = { debank: '2026-08-28T11:00:00.000Z', hyperliquid: null };

  it('counts only the wallets something is obliged to refresh', () => {
    // The denominator is the whole point of this signal. Counting standard
    // wallets — which nothing schedules — would let one fresh priority wallet
    // among twenty untouched standard ones read as full coverage.
    expect(
      summarizeWalletCoverage(
        [
          ...Array.from({ length: 20 }, () => ({
            ...sourced('2026-08-28T11:00:00.000Z', {
              debank: '2026-08-28T11:00:00.000Z',
              hyperliquid: '2026-08-28T11:00:00.000Z',
            }),
            effective_tier: 'standard',
          })),
          priority({ debank: null, hyperliquid: null }),
        ],
        NOW,
      ),
    ).toEqual({ expected: 1, fresh: 0, stale: 1, neverRefreshed: 1 });
  });

  it('never counts a never-refreshed wallet as fresh', () => {
    expect(summarizeWalletCoverage([priority(fresh)], NOW)).toEqual({
      expected: 1,
      fresh: 0,
      stale: 1,
      neverRefreshed: 1,
    });
  });

  it('measures against the stalest source at the window boundary', () => {
    const rows = [
      priority({
        debank: '2026-08-28T11:00:00.000Z',
        hyperliquid: '2026-08-27T07:00:00.000Z', // 29h — inside the window
      }),
      priority({
        debank: '2026-08-28T11:00:00.000Z',
        hyperliquid: '2026-08-27T05:00:00.000Z', // 31h — outside it
      }),
    ];

    expect(summarizeWalletCoverage(rows, NOW)).toEqual({
      expected: 2,
      fresh: 1,
      stale: 1,
      neverRefreshed: 0,
    });
  });

  it('reports an empty fleet rather than dividing by nothing', () => {
    expect(summarizeWalletCoverage([], NOW)).toEqual({
      expected: 0,
      fresh: 0,
      stale: 0,
      neverRefreshed: 0,
    });
  });
});

describe('loadPriorityWalletCoverage', () => {
  const CONFIGURED = readControlCenterConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  });

  function rpcStub(result: { data: unknown; error: unknown }) {
    return () =>
      ({ rpc: () => Promise.resolve(result) }) as unknown as ReturnType<
        typeof createSchemaClient
      >;
  }

  it('summarizes the policy rows the scheduler itself reads', async () => {
    const rows = [
      { effective_tier: 'priority', source_states: null },
      {
        effective_tier: 'priority',
        source_states: {
          debank: { last_success_at: '2026-08-28T11:00:00.000Z' },
          hyperliquid: { last_success_at: '2026-08-28T11:00:00.000Z' },
        },
      },
      { effective_tier: 'standard', source_states: null },
    ];

    await expect(
      loadPriorityWalletCoverage({
        config: CONFIGURED,
        now: NOW,
        createSupabaseClient: rpcStub({ data: rows, error: null }),
      }),
    ).resolves.toEqual({
      expected: 2,
      fresh: 1,
      stale: 1,
      neverRefreshed: 1,
    });
  });

  // Null is not zero coverage: the caller renders it as "unreadable", and a
  // summary built from a failed read would be a coverage figure invented out
  // of an outage.
  it('answers null when the policy function errors', async () => {
    await expect(
      loadPriorityWalletCoverage({
        config: CONFIGURED,
        now: NOW,
        createSupabaseClient: rpcStub({
          data: null,
          error: { message: 'function does not exist' },
        }),
      }),
    ).resolves.toBeNull();
  });

  it('answers null when the client itself throws', async () => {
    await expect(
      loadPriorityWalletCoverage({
        config: CONFIGURED,
        now: NOW,
        createSupabaseClient: () => {
          throw new Error('bad URL');
        },
      }),
    ).resolves.toBeNull();
  });

  it('asks Supabase for nothing when it is not configured', async () => {
    await expect(
      loadPriorityWalletCoverage({
        config: readControlCenterConfig({}),
        now: NOW,
        createSupabaseClient: () => {
          throw new Error('must not create a client');
        },
      }),
    ).resolves.toBeNull();
  });
});
