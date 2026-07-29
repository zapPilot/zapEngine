import {
  approvedWalletRank,
  formatApprovedWalletList,
  isApprovedWalletConnector,
} from '@core/lib/wallet/approvedWallets';
import { describe, expect, it } from 'vitest';

describe('approvedWallets', () => {
  it('formats the product-facing wallet list', () => {
    expect(formatApprovedWalletList()).toBe(
      'Rabby, Ambire, OKX Wallet, or MetaMask',
    );
  });

  it('matches approved wallets by rdns or display name', () => {
    expect(
      isApprovedWalletConnector({
        id: 'io.rabby',
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
      approvedWalletRank({ id: 'io.rabby', name: 'Rabby Wallet' }),
      approvedWalletRank({ id: 'com.ambire', name: 'Ambire Wallet' }),
      approvedWalletRank({ id: 'com.okex.wallet', name: 'OKX Wallet' }),
      approvedWalletRank({ id: 'io.metamask', name: 'MetaMask' }),
      approvedWalletRank({ id: 'app.phantom', name: 'Phantom' }),
    ];

    expect(ranks).toEqual([0, 1, 2, 3, 4]);
  });

  it('uses the connector name before the defensive rdns match', () => {
    expect(
      approvedWalletRank({
        id: 'io.rabby',
        name: 'MetaMask',
      }),
    ).toBe(3);
  });
});
