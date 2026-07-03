import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  useWalletProvider,
  WalletProviderBase,
} from '../../src/providers/walletContext';
import type { WalletProviderInterface } from '../../src/types';

const stubProvider = {
  account: {
    address: '0x742d35cc6634c0532925a3b844bc9e7595f8d1e9',
    isConnected: true,
  },
  isConnected: true,
} as unknown as WalletProviderInterface;

function ShowAddress() {
  const provider = useWalletProvider();
  return <span>{provider.account?.address}</span>;
}

describe('walletContext', () => {
  it('exposes the injected wallet backend through useWalletProvider', () => {
    const html = renderToString(
      <WalletProviderBase value={stubProvider}>
        <ShowAddress />
      </WalletProviderBase>,
    );
    expect(html).toContain('0x742d35cc6634c0532925a3b844bc9e7595f8d1e9');
  });

  it('throws when useWalletProvider is used outside a provider', () => {
    expect(() => renderToString(<ShowAddress />)).toThrow(
      'useWalletProvider must be used within a WalletProvider',
    );
  });
});
