import { useWalletProvider } from '@/providers/WalletProvider';

import {
  type TransactionDropdownState,
  useTransactionDropdownState,
} from './useTransactionDropdownState';

export interface TransactionModalStateContext {
  dropdownState: TransactionDropdownState;
  isConnected: boolean;
}

export function useTransactionModalState(): TransactionModalStateContext {
  const dropdownState = useTransactionDropdownState();
  const { isConnected } = useWalletProvider();

  return { dropdownState, isConnected };
}
