import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  useWalletLogin,
  WalletLoginProvider,
  type WalletLoginContextValue,
} from '../../src/providers/walletLoginContext';

const stubValue: WalletLoginContextValue = {
  isPickerOpen: true,
  openPicker: () => {},
  closePicker: () => {},
  connectors: [
    {
      id: 'io.rabby',
      name: 'Rabby Wallet',
      recommended: true,
      type: 'injected',
    },
  ],
  connectInjected: async () => {},
  connectWalletConnect: async () => {},
  connectPrivy: async () => {},
  connectingId: null,
  isConnecting: false,
  isWalletConnectAvailable: false,
  error: null,
  clearError: () => {},
  activeMethod: null,
};

function ShowFirstConnectorName() {
  const login = useWalletLogin();
  return <span>{login.connectors[0]?.name}</span>;
}

describe('walletLoginContext', () => {
  it('exposes the connection-method value through useWalletLogin', () => {
    const html = renderToString(
      <WalletLoginProvider value={stubValue}>
        <ShowFirstConnectorName />
      </WalletLoginProvider>,
    );
    expect(html).toContain('Rabby Wallet');
  });

  it('throws when useWalletLogin is used outside a provider', () => {
    expect(() => renderToString(<ShowFirstConnectorName />)).toThrow(
      'useWalletLogin must be used within a WalletProvider',
    );
  });
});
