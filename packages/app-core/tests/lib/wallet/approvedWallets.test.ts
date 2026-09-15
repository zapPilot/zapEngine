import { describe, expect, it } from 'vitest';

import {
  APPROVED_WALLETS,
  approvedWalletBrand,
  approvedWalletLabel,
  approvedWalletMaxCallsPerBatch,
  approvedWalletRank,
  formatApprovedWalletList,
  isApprovedWalletConnector,
} from '@core/lib/wallet/approvedWallets';

describe('approvedWallets', () => {
  it('matches approved wallets by display-name substring before rdns', () => {
    expect(
      approvedWalletBrand({
        id: 'something-else',
        name: 'My MetaMask Extension',
      }),
    ).toBe('metamask');
    expect(
      approvedWalletRank({
        id: 'something-else',
        name: 'My MetaMask Extension',
      }),
    ).toBe(2);
  });

  it('falls back to rdns when the display name does not identify the wallet', () => {
    expect(
      approvedWalletBrand({ id: 'com.okex.wallet', name: 'Browser Wallet' }),
    ).toBe('okx');
    expect(
      approvedWalletRank({ id: 'com.ambire', name: 'Injected Provider' }),
    ).toBe(0);
  });

  it('ranks unknown wallets after all approved wallets and reports them unapproved', () => {
    const unknown = { id: 'org.unknown', name: 'Mystery Wallet' };
    expect(approvedWalletRank(unknown)).toBe(APPROVED_WALLETS.length);
    expect(approvedWalletBrand(unknown)).toBeNull();
    expect(isApprovedWalletConnector(unknown)).toBe(false);
  });

  it('reports known connectors as approved', () => {
    expect(
      isApprovedWalletConnector({ id: 'io.metamask', name: 'MetaMask' }),
    ).toBe(true);
    expect(
      isApprovedWalletConnector({ id: 'random', name: 'OKX Wallet' }),
    ).toBe(true);
  });

  it('returns product labels and brand fallback for unknown values', () => {
    expect(approvedWalletLabel('ambire')).toBe('Ambire');
    expect(approvedWalletLabel('okx')).toBe('OKX Wallet');
    expect(approvedWalletLabel('unknown' as never)).toBe('unknown');
  });

  it('returns null when no measured batch ceiling is configured', () => {
    expect(approvedWalletMaxCallsPerBatch('metamask')).toBeNull();
    expect(approvedWalletMaxCallsPerBatch(undefined)).toBeNull();
    expect(approvedWalletMaxCallsPerBatch('unknown' as never)).toBeNull();
  });

  it('formats the approved list in user-facing order', () => {
    expect(formatApprovedWalletList()).toBe('Ambire, OKX Wallet, or MetaMask');
  });
});
