import { useCallback } from 'react';

import {
  isTabAccessible,
  type AppTabName,
} from '@/integration/navigationModel';
import { useAccount, type ConnectOutcome } from '@/integration/useAccount';

export interface TabAccess {
  isAccessible(tabName: AppTabName): boolean;
  connect(): Promise<ConnectOutcome>;
}

export function useTabAccess(): TabAccess {
  const account = useAccount();
  const isAccessible = useCallback(
    (tabName: AppTabName) => isTabAccessible(tabName, account.isConnected),
    [account.isConnected],
  );
  return { isAccessible, connect: account.connect };
}
