import type { DailySnapshot } from '@zapengine/types/strategy';
import { describe, expect, it } from 'vitest';

import {
  canonicalizeSnapshotForSigning,
  computePerformanceSummary,
  createSnapshotMessageHash,
  verifyCidChain,
  verifyPerformanceMetrics,
  verifySignature,
} from '../track-record-accessor';

function snapshot(
  date: string,
  navUsd: string,
  previousCid: string | null,
  performance: DailySnapshot['performance'],
): DailySnapshot {
  return {
    schemaVersion: '1.0.0',
    strategyId: 'parking-strategy',
    strategyVersion: '2026-06-poc',
    date,
    timestamp: `${date}T00:00:00.000Z`,
    chainIds: [1],
    walletAddresses: ['0x0000000000000000000000000000000000000001'],
    previousCid,
    nav: { usd: navUsd, eth: '0', btc: '0' },
    performance,
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

describe('track-record-accessor', () => {
  const snapshots = [
    snapshot('2026-06-01', '100', null, {
      dailyReturn: '0.00%',
      cumulativeReturn: '0.00%',
      maxDrawdown: '0.00%',
    }),
    snapshot('2026-06-02', '105', 'cid-1', {
      dailyReturn: '5.00%',
      cumulativeReturn: '5.00%',
      maxDrawdown: '0.00%',
    }),
    snapshot('2026-06-03', '100', 'cid-2', {
      dailyReturn: '-4.76%',
      cumulativeReturn: '0.00%',
      maxDrawdown: '-4.76%',
    }),
    snapshot('2026-06-04', '110', 'cid-3', {
      dailyReturn: '10.00%',
      cumulativeReturn: '10.00%',
      maxDrawdown: '0.00%',
    }),
  ];

  it('computes the dashboard performance summary from snapshot history', () => {
    expect(computePerformanceSummary(snapshots)).toMatchObject({
      totalDays: 4,
      startDate: '2026-06-01',
      endDate: '2026-06-04',
      startNav: '100.00',
      endNav: '110.00',
      cumulativeReturn: '+10.00%',
      maxDrawdown: '-4.76%',
      maxDrawdownDate: '2026-06-03',
      bestDay: '+10.00%',
      bestDayDate: '2026-06-04',
      worstDay: '-4.76%',
      worstDayDate: '2026-06-03',
      timeUnderwater: '1 days',
    });
  });

  it('returns an empty performance summary when there are no snapshots', () => {
    expect(computePerformanceSummary([])).toMatchObject({
      totalDays: 0,
      startDate: '',
      endDate: '',
      startNav: '0',
      endNav: '0',
      cumulativeReturn: '0.00%',
      sharpe: '—',
      sortino: '—',
    });
  });

  it('validates stored performance metrics against the NAV series', () => {
    expect(verifyPerformanceMetrics(snapshots)).toEqual({
      valid: true,
      checkedSnapshots: 4,
      errors: [],
    });

    const broken = [
      snapshots[0]!,
      snapshot('2026-06-02', '105', 'cid-1', {
        dailyReturn: '1.00%',
        cumulativeReturn: '5.00%',
        maxDrawdown: '0.00%',
      }),
    ];

    expect(verifyPerformanceMetrics(broken)).toMatchObject({
      valid: false,
      checkedSnapshots: 2,
      errors: ['[1] 2026-06-02: dailyReturn mismatch'],
    });
  });

  it('reports invalid first NAV values during metric verification', () => {
    expect(
      verifyPerformanceMetrics([
        snapshot('2026-06-01', '0', null, {
          dailyReturn: '0.00%',
          cumulativeReturn: '0.00%',
          maxDrawdown: '0.00%',
        }),
      ]),
    ).toEqual({
      valid: false,
      checkedSnapshots: 1,
      errors: ['first snapshot NAV is not a positive number'],
    });
  });

  it('validates CID chain links from genesis to latest snapshot', () => {
    expect(
      verifyCidChain([
        { cid: 'cid-1', snapshot: snapshots[0]! },
        { cid: 'cid-2', snapshot: snapshots[1]! },
        { cid: 'cid-3', snapshot: snapshots[2]! },
      ]),
    ).toEqual({ valid: true, brokenAt: undefined, totalSnapshots: 3 });

    expect(
      verifyCidChain([
        { cid: 'cid-1', snapshot: snapshots[0]! },
        { cid: 'cid-2', snapshot: snapshots[3]! },
      ]),
    ).toMatchObject({
      valid: false,
      brokenAt: 1,
      totalSnapshots: 2,
      reason: 'previous_cid_mismatch',
    });
  });

  it('rejects invalid genesis and missing CID chain entries', () => {
    expect(
      verifyCidChain([
        {
          cid: 'cid-1',
          snapshot: snapshot('2026-06-01', '100', 'not-null', {
            dailyReturn: '0.00%',
            cumulativeReturn: '0.00%',
            maxDrawdown: '0.00%',
          }),
        },
      ]),
    ).toMatchObject({ reason: 'genesis_previous_cid_not_null' });

    expect(verifyCidChain([{ cid: '', snapshot: snapshots[0]! }])).toMatchObject({
      reason: 'missing_cid',
    });
  });

  it('canonicalizes snapshots for deterministic signature hashing', () => {
    const signedA: DailySnapshot = {
      ...snapshots[0]!,
      signature: {
        signer: '0x0000000000000000000000000000000000000001',
        signedAt: '2026-06-01T00:00:00.000Z',
        messageHash: '0xaaa',
        signature: '0xbbb',
      },
    };
    const signedB: DailySnapshot = {
      ...signedA,
      signature: {
        signer: '0x0000000000000000000000000000000000000002',
        signedAt: '2026-06-02T00:00:00.000Z',
        messageHash: '0xccc',
        signature: '0xddd',
      },
    };

    expect(canonicalizeSnapshotForSigning(signedA)).toBe(
      canonicalizeSnapshotForSigning(signedB),
    );
    expect(createSnapshotMessageHash(signedA)).toBe(
      createSnapshotMessageHash(signedB),
    );
  });

  it('treats a missing signature as optional only without an expected signer', async () => {
    await expect(verifySignature(snapshots[0]!, '')).resolves.toMatchObject({
      valid: true,
      signaturePresent: false,
      reason: 'unsigned_optional',
    });
    await expect(
      verifySignature(snapshots[0]!, '0x0000000000000000000000000000000000000001'),
    ).resolves.toMatchObject({
      valid: false,
      signaturePresent: false,
      reason: 'missing_signature',
    });
  });

  it('rejects malformed signature payloads before recovery', async () => {
    const invalidSignature: DailySnapshot = {
      ...snapshots[0]!,
      signature: {
        signer: 'not-an-address',
        signedAt: '2026-06-01T00:00:00.000Z',
        messageHash: createSnapshotMessageHash(snapshots[0]!),
        signature: '0x1234',
      },
    };

    await expect(
      verifySignature(
        invalidSignature,
        '0x0000000000000000000000000000000000000001',
      ),
    ).resolves.toMatchObject({
      valid: false,
      signaturePresent: true,
      reason: 'invalid_claimed_signer',
    });
  });
});
