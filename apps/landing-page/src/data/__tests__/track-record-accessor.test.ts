import type { DailySnapshot } from '@zapengine/types/strategy';
import { describe, expect, it } from 'vitest';
import {
  verifyCidChain,
  verifyPerformanceMetrics,
  verifySignature,
} from '../track-record-accessor';

function makeSnapshot(overrides: Partial<DailySnapshot> = {}): DailySnapshot {
  return {
    schemaVersion: '1',
    strategyId: 'demo',
    strategyVersion: 'v1',
    date: '2026-06-27',
    timestamp: '2026-06-27T00:00:00.000Z',
    chainIds: [1],
    walletAddresses: ['0x0000000000000000000000000000000000000001'],
    previousCid: null,
    nav: { usd: '100.00' },
    performance: {
      dailyReturn: '0.00%',
      cumulativeReturn: '0.00%',
      maxDrawdown: '0.00%',
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
    ...overrides,
  };
}

describe('track-record verification', () => {
  it('accepts a CID chain when every snapshot points to the prior fetched CID', () => {
    const result = verifyCidChain([
      {
        cid: 'bafygenesis',
        snapshot: makeSnapshot({ date: '2026-06-25', previousCid: null }),
      },
      {
        cid: 'bafyday2',
        snapshot: makeSnapshot({
          date: '2026-06-26',
          previousCid: 'bafygenesis',
        }),
      },
    ]);

    expect(result).toMatchObject({
      valid: true,
      brokenAt: undefined,
      totalSnapshots: 2,
    });
  });

  it('rejects a CID chain when previousCid does not equal the prior snapshot CID', () => {
    const result = verifyCidChain([
      {
        cid: 'bafygenesis',
        snapshot: makeSnapshot({ date: '2026-06-25', previousCid: null }),
      },
      {
        cid: 'bafyday2',
        snapshot: makeSnapshot({
          date: '2026-06-26',
          previousCid: 'bafywrong',
        }),
      },
    ]);

    expect(result).toMatchObject({
      valid: false,
      brokenAt: 1,
      totalSnapshots: 2,
    });
  });

  it('accepts an EIP-191 signature recovered from the official signer', async () => {
    const fixtureSigner = '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c';
    const result = await verifySignature(
      makeSnapshot({
        signature: {
          signer: fixtureSigner,
          signedAt: '2026-06-27T00:00:01.000Z',
          messageHash:
            '0x2592be911d7c09084191c4673cddfebc9bdee5180c031c32b036482e6a035ac0',
          signature:
            '0xb054134d584b4b96e056be6b673ce89d45d2802cde7c3b41025a24436afd144a758b8d1742939910fe5d2404cd9ff0c47cc745a8d032353428f7d5ffc72f6d3e1b',
        },
      }),
      fixtureSigner,
    );

    expect(result).toMatchObject({
      valid: true,
      messageHashValid: true,
      recoveredSigner: fixtureSigner,
    });
  });

  it('rejects a claimed signer when the EIP-191 signature recovers a different address', async () => {
    const expectedSigner = '0x000000000000000000000000000000000000dEaD';
    const signedByFixtureSigner =
      '0xb054134d584b4b96e056be6b673ce89d45d2802cde7c3b41025a24436afd144a758b8d1742939910fe5d2404cd9ff0c47cc745a8d032353428f7d5ffc72f6d3e1b';

    const result = await verifySignature(
      makeSnapshot({
        signature: {
          signer: expectedSigner,
          signedAt: '2026-06-27T00:00:01.000Z',
          messageHash:
            '0x2592be911d7c09084191c4673cddfebc9bdee5180c031c32b036482e6a035ac0',
          signature: signedByFixtureSigner,
        },
      }),
      expectedSigner,
    );

    expect(result).toMatchObject({
      valid: false,
      recoveredSigner: '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c',
      reason: 'signer_mismatch',
    });
  });

  it('rejects snapshots whose stored daily return does not match recomputed NAV return', () => {
    const result = verifyPerformanceMetrics([
      makeSnapshot({ date: '2026-06-26', nav: { usd: '100.00' } }),
      makeSnapshot({
        date: '2026-06-27',
        nav: { usd: '110.00' },
        performance: {
          dailyReturn: '+5.00%',
          cumulativeReturn: '+10.00%',
          maxDrawdown: '0.00%',
        },
      }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('dailyReturn mismatch');
  });
});
