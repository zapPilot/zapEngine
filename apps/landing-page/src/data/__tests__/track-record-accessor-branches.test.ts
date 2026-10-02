import type { DailySnapshot, TrackRecordMeta } from '@zapengine/types/strategy';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { privateKeyToAccount } from 'viem/accounts';

import {
  canonicalizeSnapshotForSigning,
  computePerformanceSummary,
  createSnapshotMessageHash,
  fetchLatestSnapshot,
  fetchMeta,
  fetchSnapshotHistoryEntries,
  verifyPerformanceMetrics,
  verifySignature,
} from '../track-record-accessor';

const accountA = privateKeyToAccount(`0x${'1'.repeat(64)}`);
const accountB = privateKeyToAccount(`0x${'2'.repeat(64)}`);
const SIGNER_A = accountA.address;
const SIGNER_B = accountB.address;

function snapshot(
  date = '2026-01-01',
  nav = '100',
  previousCid: string | null = null,
  performance: Partial<DailySnapshot['performance']> = {},
): DailySnapshot {
  return {
    schemaVersion: '1',
    strategyId: 'strategy',
    strategyVersion: 'v1',
    date,
    timestamp: `${date}T00:00:00.000Z`,
    chainIds: [1],
    walletAddresses: [SIGNER_A],
    previousCid,
    nav: { usd: nav },
    performance: {
      dailyReturn: '0.00%',
      cumulativeReturn: '0.00%',
      maxDrawdown: '0.00%',
      ...performance,
    },
    positions: [],
    costs: {
      gasUsd: '0',
      slippageUsd: '0',
      protocolFeesUsd: '0',
      totalUsd: '0',
    },
    transactions: [],
    benchmarks: [],
  };
}

function meta(latestSnapshotCid = 'cid-latest'): TrackRecordMeta {
  return {
    schemaVersion: '1',
    strategyId: 'strategy',
    strategyVersion: 'v1',
    latestSnapshotCid,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('track-record network accessors', () => {
  it('loads and validates metadata', async () => {
    const value = meta();
    const fetchMock = vi.fn().mockResolvedValue(response(value));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchMeta()).resolves.toEqual(value);
    expect(fetchMock).toHaveBeenCalledWith('/track-record-meta.json');
  });

  it('reports metadata HTTP and schema failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, false, 503)));
    await expect(fetchMeta()).rejects.toThrow('Failed to fetch meta: 503');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({})));
    await expect(fetchMeta()).rejects.toThrow();
  });

  it('requires a latest CID', async () => {
    await expect(fetchLatestSnapshot(meta(''))).rejects.toThrow(
      'No latestSnapshotCid in meta',
    );
  });

  it('falls through a failed gateway and parses the next response', async () => {
    const value = snapshot();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, false, 502))
      .mockResolvedValueOnce(response(value));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchLatestSnapshot(meta())).resolves.toEqual(value);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports exhaustion after every gateway fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, false, 500)));
    await expect(fetchLatestSnapshot(meta())).rejects.toThrow(
      /All 2 IPFS gateways failed/,
    );
  });

  it('aborts a stalled gateway request at the timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          if (signal?.aborted) return reject(new Error('aborted'));
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }),
    );
    const pending = fetchLatestSnapshot(meta());
    const rejection = expect(pending).rejects.toThrow(
      /All 2 IPFS gateways failed/,
    );
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;
  });

  it('walks history newest-to-genesis and honours a limit', async () => {
    const bodies: Record<string, DailySnapshot> = {
      'cid-3': snapshot('2026-01-03', '103', 'cid-2'),
      'cid-2': snapshot('2026-01-02', '102', 'cid-1'),
      'cid-1': snapshot('2026-01-01', '100', null),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(response(bodies[url.split('/').at(-1)!])),
      ),
    );
    expect(
      (await fetchSnapshotHistoryEntries('cid-3', 2)).map((entry) => entry.cid),
    ).toEqual(['cid-2', 'cid-3']);
  });

  it('stops a cyclic history', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(snapshot('2026-01-01', '100', 'cycle')));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchSnapshotHistoryEntries('cycle')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('performance edge cases', () => {
  it('handles a zero previous NAV', () => {
    const summary = computePerformanceSummary([
      snapshot('2026-01-01', '100'),
      snapshot('2026-01-02', '0'),
      snapshot('2026-01-03', '10'),
    ]);
    expect(summary).toMatchObject({ totalDays: 3, bestDay: '+0.00%' });
  });

  it('computes long-window ratios', () => {
    const values = Array.from({ length: 32 }, (_, index) =>
      snapshot(
        `2026-02-${String(index + 1).padStart(2, '0')}`,
        String(100 + (index % 2 === 0 ? index : -index / 2)),
      ),
    );
    const summary = computePerformanceSummary(values);
    expect(summary.volatility30d).not.toBe('0.00%');
    expect(summary.sharpe).not.toBe('—');
    expect(summary.sortino).not.toBe('—');
  });

  it('accepts empty metrics and rejects invalid NAVs', () => {
    expect(verifyPerformanceMetrics([])).toEqual({
      valid: true,
      checkedSnapshots: 0,
      errors: [],
    });
    expect(
      verifyPerformanceMetrics([snapshot('2026-01-01', 'NaN')]),
    ).toMatchObject({
      valid: false,
      errors: ['first snapshot NAV is not a positive number'],
    });
    const result = verifyPerformanceMetrics([
      snapshot('2026-01-01', '100', null, {
        dailyReturn: '',
        cumulativeReturn: '',
        maxDrawdown: '',
      }),
      snapshot('2026-01-02', 'NaN'),
      snapshot('2026-01-03', '100'),
    ]);
    expect(result.errors).toContain(
      '[1] 2026-01-02: NAV is not a positive number',
    );
  });

  it('reports every stored performance mismatch', () => {
    const values = Array.from({ length: 31 }, (_, index) =>
      snapshot(
        `2026-03-${String(index + 1).padStart(2, '0')}`,
        String(100 + (index % 2 === 0 ? index : -index / 3)),
        null,
        index === 30
          ? {
              dailyReturn: '999%',
              cumulativeReturn: '999%',
              maxDrawdown: '999%',
              volatility30d: '999%',
              sharpe: '999',
              sortino: '999',
            }
          : {},
      ),
    );
    const result = verifyPerformanceMetrics(values);
    for (const name of [
      'cumulativeReturn',
      'maxDrawdown',
      'dailyReturn',
      'volatility30d',
      'sharpe',
      'sortino',
    ]) {
      expect(
        result.errors.some((error) => error.includes(`${name} mismatch`)),
      ).toBe(true);
    }
  });
});

describe('signature verification branches', () => {
  async function signed(
    overrides: Partial<NonNullable<DailySnapshot['signature']>> = {},
  ): Promise<DailySnapshot> {
    const base = snapshot();
    return {
      ...base,
      signature: {
        signer: SIGNER_A,
        signedAt: '2026-01-01T00:00:00.000Z',
        messageHash: createSnapshotMessageHash(base),
        signature: await accountA.signMessage({
          message: { raw: createSnapshotMessageHash(base) as `0x${string}` },
        }),
        ...overrides,
      },
    };
  }

  it('canonicalizes undefined fields and array entries', () => {
    const value = {
      ...snapshot(),
      extra: { z: undefined, b: [undefined, 1], a: null },
    } as DailySnapshot;
    expect(canonicalizeSnapshotForSigning(value)).toContain(
      '"extra":{"a":null,"b":[null,1]}',
    );
  });

  it('rejects missing fields and invalid expected signers', async () => {
    await expect(
      verifySignature(await signed({ signature: '' }), SIGNER_A),
    ).resolves.toMatchObject({
      reason: 'missing_signature_field',
    });
    await expect(
      verifySignature(await signed(), 'not-an-address'),
    ).resolves.toMatchObject({
      reason: 'invalid_expected_signer',
    });
  });

  it('reports message-hash mismatches with and without an expected signer', async () => {
    const badHash = await signed({ messageHash: '0xdead' });
    await expect(verifySignature(badHash, SIGNER_A)).resolves.toMatchObject({
      reason: 'message_hash_mismatch',
      expectedSigner: SIGNER_A,
      messageHashValid: false,
    });
    await expect(verifySignature(badHash, '')).resolves.toMatchObject({
      reason: 'message_hash_mismatch',
      expectedSigner: undefined,
    });
  });

  it('reports recovery and signer mismatches', async () => {
    await expect(
      verifySignature(await signed({ signature: '0xdead' }), SIGNER_A),
    ).resolves.toMatchObject({ reason: 'recover_failed' });
    const otherSignature = await accountB.signMessage({
      message: { raw: createSnapshotMessageHash(snapshot()) as `0x${string}` },
    });
    const otherSigned = await signed({ signature: otherSignature });
    await expect(verifySignature(otherSigned, SIGNER_A)).resolves.toMatchObject(
      { reason: 'signer_mismatch' },
    );
    await expect(verifySignature(otherSigned, SIGNER_B)).resolves.toMatchObject(
      { reason: 'claimed_signer_mismatch' },
    );
  });

  it('rejects payload tampering after a valid signature', async () => {
    const value = await signed();
    value.nav.usd = '101';
    await expect(verifySignature(value, SIGNER_A)).resolves.toMatchObject({
      reason: 'message_hash_mismatch',
    });
    value.signature!.messageHash = createSnapshotMessageHash(value);
    await expect(verifySignature(value, SIGNER_A)).resolves.toMatchObject({
      reason: 'signer_mismatch',
    });
  });

  it('accepts matching signers with explicit or claimed expectations', async () => {
    await expect(
      verifySignature(await signed(), SIGNER_A),
    ).resolves.toMatchObject({
      valid: true,
    });
    await expect(verifySignature(await signed(), '')).resolves.toMatchObject({
      valid: true,
      expectedSigner: SIGNER_A,
    });
  });
});
