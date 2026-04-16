import type { Dispatch, SetStateAction } from "react";

import { extractErrorMessage } from "@/lib/errors";
import { walletLogger } from "@/utils";

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
  balanceDisplayValue: string | undefined
): SimplifiedWalletAccount | null => {
  if (!address) {
    return null;
  }

  return {
    address,
    isConnected: true,
    balance: balanceDisplayValue ?? "0",
  };
};

export const buildWalletChain = (
  chain: WalletChainSource | null | undefined
): SimplifiedChain | null => {
  if (!chain) {
    return null;
  }

  return {
    id: chain.id,
    name: chain.name ?? `Chain ${chain.id}`,
    symbol: chain.nativeCurrency?.symbol ?? "ETH",
  };
};

export const handleWalletOperationError = (
  setError: Dispatch<SetStateAction<WalletError | null>>,
  error: unknown,
  fallbackMessage: string,
  code: string,
  logPrefix: string
): never => {
  const errorMessage = extractErrorMessage(error, fallbackMessage);
  setError({ message: errorMessage, code });
  walletLogger.error(logPrefix, error);
  throw error;
};
