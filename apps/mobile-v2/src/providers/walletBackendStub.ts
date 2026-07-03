import type { WalletProviderInterface } from '@zapengine/app-core/types';

function unavailableWalletOperation(): Promise<never> {
  return Promise.reject(new Error('Wallet backend is not connected.'));
}

export function createDisconnectedWalletBackend(): WalletProviderInterface {
  return {
    account: null,
    chain: null,
    connect: async () => {},
    disconnect: async () => {},
    switchChain: async () => {},
    sendTransaction: unavailableWalletOperation,
    getWalletClient: unavailableWalletOperation,
    signMessage: unavailableWalletOperation,
    signTypedData: unavailableWalletOperation,
    isConnected: false,
    isConnecting: false,
    isDisconnecting: false,
    error: null,
    clearError: () => {},
    connectedWallets: [],
    switchActiveWallet: async () => {},
    hasMultipleWallets: false,
  };
}
