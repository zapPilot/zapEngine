import { useCallback } from 'react';

import {
  isTabAccessible,
  type AppTabName,
} from '@/integration/navigationModel';
import { useAccount } from '@/integration/useAccount';

export interface TabAccess {
  isAccessible(tabName: AppTabName): boolean;
  connect(): Promise<void>;
}

export function useTabAccess(): TabAccess {
  const account = useAccount();
  const isAccessible = useCallback(
    (tabName: AppTabName) => isTabAccessible(tabName, account.isConnected),
    [account.isConnected],
  );
  return { isAccessible, connect: account.connect };
}
