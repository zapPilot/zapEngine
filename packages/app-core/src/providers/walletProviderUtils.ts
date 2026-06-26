export interface SimplifiedWalletAccount {
  address: string;
  isConnected: boolean;
  balance?: string;
}

export interface SimplifiedChain {
  id: number;
  name: string;
  symbol: string;
}

export interface WalletError {
  message: string;
  code?: string;
}

interface WalletChainSource {
  id: number;
  name?: string;
  nativeCurrency?: {
    symbol?: string;
  };
}

export const buildWalletAccount = (
  address: string | undefined,
  balanceDisplayValue?: string,
): SimplifiedWalletAccount | null => {
  if (!address) {
    return null;
  }

  return {
    address,
    isConnected: true,
    balance: balanceDisplayValue ?? '0',
  };
};

export const buildWalletChain = (
  chain: WalletChainSource | null | undefined,
): SimplifiedChain | null => {
  if (!chain) {
    return null;
  }

  return {
    id: chain.id,
    name: chain.name ?? `Chain ${chain.id}`,
    symbol: chain.nativeCurrency?.symbol ?? 'ETH',
  };
};
