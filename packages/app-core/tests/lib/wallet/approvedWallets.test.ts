import {
  approvedWalletBrand,
  approvedWalletRank,
  formatApprovedWalletList,
  isApprovedWalletConnector,
} from '@core/lib/wallet/approvedWallets';
import { describe, expect, it } from 'vitest';

describe('approvedWallets', () => {
  it('formats the product-facing wallet list', () => {
    expect(formatApprovedWalletList()).toBe('Ambire, OKX Wallet, or MetaMask');
  });

  it('matches approved wallets by rdns or display name', () => {
    expect(
      isApprovedWalletConnector({
        id: 'com.ambire',
        name: 'Browser Wallet',
      }),
    ).toBe(true);
    expect(
      isApprovedWalletConnector({
        id: 'unknown.wallet',
        name: 'Ambire Browser Extension',
      }),
    ).toBe(true);
  });

  it('resolves a stable execution brand from connector identity', () => {
    expect(
      approvedWalletBrand({ id: 'com.ambire', name: 'Browser Wallet' }),
    ).toBe('ambire');
    expect(
      approvedWalletBrand({ id: 'com.okex.wallet', name: 'OKX Wallet' }),
    ).toBe('okx');
    expect(approvedWalletBrand({ id: 'io.metamask', name: 'MetaMask' })).toBe(
      'metamask',
    );
    expect(
      approvedWalletBrand({ id: 'app.phantom', name: 'Phantom' }),
    ).toBeNull();
  });

  it('rejects Rabby because it cannot execute the required wallet batch API', () => {
    expect(
      isApprovedWalletConnector({
        id: 'io.rabby',
        name: 'Rabby Wallet',
      }),
    ).toBe(false);
  });

  it('approves OKX and MetaMask while rejecting unapproved wallets', () => {
    expect(
      isApprovedWalletConnector({
        id: 'com.okex.wallet',
        name: 'OKX Wallet',
      }),
    ).toBe(true);
    expect(
      isApprovedWalletConnector({
        id: 'io.metamask',
        name: 'MetaMask',
      }),
    ).toBe(true);
    expect(
      isApprovedWalletConnector({
        id: 'app.phantom',
        name: 'Phantom',
      }),
    ).toBe(false);
  });

  it('ranks approved wallets in product display order and unknowns last', () => {
    const ranks = [
      approvedWalletRank({ id: 'com.ambire', name: 'Ambire Wallet' }),
      approvedWalletRank({ id: 'com.okex.wallet', name: 'OKX Wallet' }),
      approvedWalletRank({ id: 'io.metamask', name: 'MetaMask' }),
      approvedWalletRank({ id: 'app.phantom', name: 'Phantom' }),
    ];

    expect(ranks).toEqual([0, 1, 2, 3]);
  });

  it('uses the connector name before the defensive rdns match', () => {
    expect(
      approvedWalletRank({
        id: 'app.phantom',
        name: 'MetaMask',
      }),
    ).toBe(2);
  });
});
