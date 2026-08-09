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
      id: 'com.ambire',
      name: 'Ambire Wallet',
      recommended: true,
      type: 'injected',
    },
  ],
  connectInjected: async () => {},
  connectPrivy: async () => {},
  connectingId: null,
  isConnecting: false,
  error: null,
};

function ShowFirstConnectorName() {
  const login = useWalletLogin();
  return <span>{login.connectors[0]?.name}</span>;
}

describe('walletLoginContext', () => {
  it('exposes connector options through useWalletLogin', () => {
    const html = renderToString(
      <WalletLoginProvider value={stubValue}>
        <ShowFirstConnectorName />
      </WalletLoginProvider>,
    );
    expect(html).toContain('Ambire Wallet');
  });

  it('throws when useWalletLogin is used outside a provider', () => {
    expect(() => renderToString(<ShowFirstConnectorName />)).toThrow(
      'useWalletLogin must be used within a WalletProvider',
    );
  });
});
