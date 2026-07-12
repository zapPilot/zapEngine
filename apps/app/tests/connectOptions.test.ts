import type { WalletConnectorOption } from '@zapengine/app-core/types';
import { describe, expect, it } from 'vitest';

import {
  mapConnectError,
  partitionWalletOptions,
} from '@/integration/connectOptions';

function connector(
  overrides: Partial<WalletConnectorOption> &
    Pick<WalletConnectorOption, 'id' | 'name'>,
): WalletConnectorOption {
  return { recommended: false, type: 'injected', ...overrides };
}

describe('partitionWalletOptions', () => {
  it('keeps only approved wallets in Rabby, Ambire, OKX order', () => {
    const result = partitionWalletOptions([
      connector({ id: 'io.metamask', name: 'MetaMask' }),
      connector({ id: 'com.okex.wallet', name: 'OKX Wallet' }),
      connector({ id: 'com.ambire', name: 'Ambire Wallet', recommended: true }),
      connector({ id: 'io.rabby', name: 'Rabby Wallet', recommended: true }),
      connector({
        id: 'walletConnect',
        name: 'WalletConnect',
        type: 'walletConnect',
      }),
    ]);
    expect(result.recommended.map((option) => option.name)).toEqual([
      'Rabby Wallet',
      'Ambire Wallet',
      'OKX Wallet',
    ]);
    expect(result.other).toEqual([]);
    expect(result.hasInjected).toBe(true);
  });

  it('hides unapproved injected wallets and generic WalletConnect', () => {
    const result = partitionWalletOptions([
      connector({ id: 'io.metamask', name: 'MetaMask' }),
      connector({
        id: 'walletConnect',
        name: 'WalletConnect',
        type: 'walletConnect',
      }),
    ]);
    expect(result.other).toEqual([]);
    expect(result.recommended).toEqual([]);
    expect(result.hasInjected).toBe(false);
  });

  it('reports hasInjected only when an injected connector is present', () => {
    expect(partitionWalletOptions([]).hasInjected).toBe(false);
    expect(
      partitionWalletOptions([
        connector({
          id: 'walletConnect',
          name: 'WalletConnect',
          type: 'walletConnect',
        }),
      ]).hasInjected,
    ).toBe(false);
    expect(
      partitionWalletOptions([connector({ id: 'io.rabby', name: 'Rabby' })])
        .hasInjected,
    ).toBe(true);
  });
});

describe('mapConnectError', () => {
  it('returns null when there is no error', () => {
    expect(mapConnectError(null)).toBeNull();
  });

  it('maps WALLET_SELECTION_REQUIRED to a selection prompt', () => {
    expect(
      mapConnectError({
        message: 'Multiple wallets detected.',
        code: 'WALLET_SELECTION_REQUIRED',
      }),
    ).toMatchObject({ title: 'Choose a wallet' });
  });

  it('maps NO_WALLET (and provider-not-found messages) to an unreachable-wallet copy', () => {
    expect(
      mapConnectError({ message: 'No wallet detected', code: 'NO_WALLET' }),
    ).toMatchObject({ title: "Couldn't reach that wallet" });
    // wagmi's ProviderNotFoundError message (@wagmi/core/errors/connector.ts)
    expect(mapConnectError({ message: 'Provider not found.' })).toMatchObject({
      title: "Couldn't reach that wallet",
    });
  });

  it('maps a user-rejection message to a cancelled copy', () => {
    expect(
      mapConnectError({ message: 'User rejected the request.' }),
    ).toMatchObject({ title: 'Request cancelled' });
  });

  it('falls back to the raw message for unrecognized errors', () => {
    expect(mapConnectError({ message: 'Something odd happened' })).toEqual({
      title: 'Connection failed',
      body: 'Something odd happened',
    });
  });
});
