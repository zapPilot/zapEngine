import { describe, expect, it } from 'vitest';

import { toWalletRows } from '../src/integration/walletManagerModel';

const WALLETS = [
  {
    id: 'w-1',
    address: '0xAbCd000000000000000000000000000000000001',
    label: 'Main',
    isMain: true,
    isActive: false,
    createdAt: '2026-01-01T00:00:00Z',
    ownershipVerifiedAt: null,
    isVerified: false,
  },
  {
    id: 'w-2',
    address: '0x0000000000000000000000000000000000000002',
    label: 'Cold storage',
    isMain: false,
    isActive: false,
    createdAt: '2026-01-02T00:00:00Z',
    ownershipVerifiedAt: '2026-01-02T00:05:00Z',
    isVerified: true,
  },
];

describe('toWalletRows', () => {
  it('marks the connected signer active with a case-insensitive match', () => {
    const rows = toWalletRows(
      WALLETS,
      '0xABCD000000000000000000000000000000000001',
    );

    expect(rows.map((row) => row.isActive)).toEqual([true, false]);
    expect(rows.map((row) => row.canVerify)).toEqual([true, false]);
    expect(rows.map((row) => row.isVerified)).toEqual([false, true]);
  });

  it('keeps unverified wallets verifiable even when they are not active', () => {
    const rows = toWalletRows(WALLETS, null);

    expect(rows.every((row) => !row.isActive)).toBe(true);
    expect(rows.map((row) => row.canVerify)).toEqual([true, false]);
  });

  it('preserves order, ids, and labels', () => {
    const rows = toWalletRows(WALLETS, null);

    expect(
      rows.map(({ id, label, address }) => ({ id, label, address })),
    ).toEqual([
      {
        id: 'w-1',
        label: 'Main',
        address: '0xAbCd000000000000000000000000000000000001',
      },
      {
        id: 'w-2',
        label: 'Cold storage',
        address: '0x0000000000000000000000000000000000000002',
      },
    ]);
  });
});
