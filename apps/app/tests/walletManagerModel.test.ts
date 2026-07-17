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
  },
  {
    id: 'w-2',
    address: '0x0000000000000000000000000000000000000002',
    label: 'Cold storage',
    isMain: false,
    isActive: false,
    createdAt: '2026-01-02T00:00:00Z',
  },
];

describe('toWalletRows', () => {
  it('marks the connected signer active with a case-insensitive match', () => {
    const rows = toWalletRows(
      WALLETS,
      '0xABCD000000000000000000000000000000000001',
    );

    expect(rows.map((row) => row.isActive)).toEqual([true, false]);
  });

  it('marks nothing active without a connected address', () => {
    const rows = toWalletRows(WALLETS, null);

    expect(rows.every((row) => !row.isActive)).toBe(true);
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
