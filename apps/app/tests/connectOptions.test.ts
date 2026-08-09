import type { WalletConnectorOption } from '@zapengine/app-core/types';
import { describe, expect, it } from 'vitest';

import {
  approvedWalletOptions,
  mapConnectError,
} from '@/integration/connectOptions';

function connector(
  overrides: Partial<WalletConnectorOption> &
    Pick<WalletConnectorOption, 'id' | 'name'>,
): WalletConnectorOption {
  return { recommended: false, type: 'injected', ...overrides };
}

describe('approvedWalletOptions', () => {
  it('keeps approved wallets in Ambire, OKX, MetaMask order and excludes Rabby', () => {
    const result = approvedWalletOptions([
      connector({ id: 'io.metamask', name: 'MetaMask' }),
      connector({ id: 'com.okex.wallet', name: 'OKX Wallet' }),
      connector({ id: 'com.ambire', name: 'Ambire Wallet', recommended: true }),
      connector({ id: 'io.rabby', name: 'Rabby Wallet', recommended: false }),
      connector({
        id: 'walletConnect',
        name: 'WalletConnect',
        type: 'walletConnect',
      }),
    ]);
    expect(result.map((option) => option.name)).toEqual([
      'Ambire Wallet',
      'OKX Wallet',
      'MetaMask',
    ]);
  });

  it('hides unapproved injected wallets and generic WalletConnect', () => {
    const result = approvedWalletOptions([
      connector({ id: 'app.phantom', name: 'Phantom' }),
      connector({
        id: 'walletConnect',
        name: 'WalletConnect',
        type: 'walletConnect',
      }),
    ]);
    expect(result).toEqual([]);
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
    const noWalletCopy = mapConnectError({
      message: 'No wallet detected',
      code: 'NO_WALLET',
    });
    expect(noWalletCopy).toMatchObject({
      title: "Couldn't reach that wallet",
    });
    expect(noWalletCopy?.body).toContain('MetaMask');
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
