import { describe, expect, it } from 'vitest';

// NOTE: 'pg' is intentionally NOT mocked here. With NODE_ENV=test and
// MOCK_APIS=true (global setup), createDbPool() returns the in-memory mock
// pool whose runMockQuery exercises recordMockSourceRefresh,
// parseMockRefreshRows, and updateMockPortfolioTimestamps.
import { createDbPool } from '../../../src/config/database.js';

const wallet = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function refreshRow(overrides: Record<string, unknown> = {}) {
  return {
    wallet,
    source: 'debank',
    succeeded: true,
    ...overrides,
  };
}

describe('database mock refresh-state coverage', () => {
  it('accepts a JSON-string payload', async () => {
    const pool = createDbPool();

    const result = await pool.query(
      'SELECT ops_record_wallet_source_refresh($1)',
      [JSON.stringify([refreshRow({ source: 'hyperliquid' })])],
    );

    expect(result.rowCount).toBe(0);
  });

  it('ignores non-array payloads', async () => {
    const pool = createDbPool();

    await expect(
      pool.query('SELECT ops_record_wallet_source_refresh($1)', [
        JSON.stringify({ wallet }),
      ]),
    ).resolves.toMatchObject({ rowCount: 0 });

    await expect(
      pool.query('SELECT ops_record_wallet_source_refresh($1)', [undefined]),
    ).resolves.toMatchObject({ rowCount: 0 });
  });

  it('skips malformed refresh rows', async () => {
    const pool = createDbPool();

    const result = await pool.query(
      'SELECT ops_record_wallet_source_refresh($1)',
      [
        [
          refreshRow({ wallet: 123 }),
          refreshRow({ wallet: '' }),
          refreshRow({ source: 42 }),
          refreshRow({ succeeded: 'yes' }),
        ],
      ],
    );

    expect(result.rowCount).toBe(0);
  });

  it('resolves duplicate wallet/source keys deterministically', async () => {
    const pool = createDbPool();
    const fixtureWallet = '0x1111111111111111111111111111111111111111';

    async function debankState() {
      const states = await pool.query(
        'SELECT * FROM get_user_service_states()',
      );
      const row = states.rows.find(
        (candidate) =>
          typeof candidate === 'object' &&
          candidate !== null &&
          (candidate as Record<string, unknown>)['wallet'] === fixtureWallet,
      ) as unknown as
        | { source_states: { debank: Record<string, unknown> } }
        | undefined;
      return row?.source_states.debank;
    }

    // A repeated success keeps the first row: no error is recorded.
    await pool.query('SELECT ops_record_wallet_source_refresh($1)', [
      [
        { wallet: fixtureWallet, source: 'debank', succeeded: true },
        { wallet: fixtureWallet, source: 'debank', succeeded: true },
      ],
    ]);

    const afterSuccess = await debankState();
    expect(afterSuccess?.['last_error']).toBeNull();
    expect(afterSuccess?.['last_success_at']).not.toBeNull();

    // A failure arriving after success wins the resolved row so the wallet
    // stays due, while the earlier success timestamp is preserved.
    await pool.query('SELECT ops_record_wallet_source_refresh($1)', [
      [
        { wallet: fixtureWallet, source: 'debank', succeeded: true },
        {
          wallet: fixtureWallet,
          source: 'debank',
          succeeded: false,
          error: 'boom',
        },
      ],
    ]);

    const afterFailure = await debankState();
    expect(afterFailure?.['last_error']).toBe('boom');
    expect(afterFailure?.['last_success_at']).toBe(
      afterSuccess?.['last_success_at'],
    );
  });

  it('returns zero when portfolio timestamp targets are not an array', async () => {
    const pool = createDbPool();

    const result = await pool.query(
      'UPDATE user_crypto_wallets SET last_portfolio_update_at = NOW() WHERE wallet = ANY($1)',
      ['not-an-array'],
    );

    expect(result.rowCount).toBe(0);
  });
});
