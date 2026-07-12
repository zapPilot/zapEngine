import { useToast } from '@zapengine/app-core/providers/ToastContext';
import { useWalletLogin } from '@zapengine/app-core/providers/WalletProvider';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import type { WalletConnectorOption } from '@zapengine/app-core/types';
import { useEffect, useRef } from 'react';

import { ConnectSheet } from '@/components/connect/ConnectSheet';
import {
  mapConnectError,
  partitionWalletOptions,
} from '@/integration/connectOptions';
import { useAuthenticatedAction } from '@/providers/AuthenticatedActionProvider';

/**
 * Wires the custom connect picker to the wallet-login seam and mounts the
 * sheet once for the whole app (inside `AppProviderShell`, alongside
 * `ToastProvider`, so any screen's `account.connect()` can open it — see
 * `WalletProvider`'s `connect` override in app-core).
 */
export function ConnectSheetHost() {
  const login = useWalletLogin();
  const wallet = useWalletProvider();
  const { showToast } = useToast();
  const authAction = useAuthenticatedAction();
  const wasConnectedRef = useRef(wallet.isConnected);

  useEffect(() => {
    const justConnected = !wasConnectedRef.current && wallet.isConnected;
    wasConnectedRef.current = wallet.isConnected;
    if (justConnected && login.isPickerOpen) {
      login.closePicker();
      showToast({ type: 'success', title: 'Wallet connected' });
    }
  }, [wallet.isConnected, login, showToast]);

  const { recommended, other } = partitionWalletOptions(login.connectors);
  const errorCopy = mapConnectError(login.error);

  const handleWalletPress = (option: WalletConnectorOption) => {
    if (option.type === 'walletConnect') {
      void login.connectWalletConnect();
    } else {
      void login.connectInjected(option.id);
    }
  };

  return (
    <ConnectSheet
      visible={login.isPickerOpen}
      onClose={() => {
        authAction.cancel();
        login.closePicker();
      }}
      recommended={recommended}
      other={other}
      connectingId={login.connectingId}
      errorCopy={errorCopy}
      onPrivyPress={() => void login.connectPrivy()}
      onWalletPress={handleWalletPress}
    />
  );
}
