import { getUserByWallet } from '@zapengine/app-core/services/accountService';
import { useCallback, useEffect, useRef, useState } from 'react';

import { setBundleView } from './bundleViewStore';
import { classifyWalletSearch } from './walletSearchModel';

export type WalletSearchState =
  | 'idle'
  | 'invalid'
  | 'loading'
  | 'notFound'
  | 'error';

export function useWalletSearch(
  ownUserId: string | null,
  ownAddresses: readonly string[],
) {
  const [state, setState] = useState<WalletSearchState>('idle');
  const requestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [ownUserId],
  );
  const clear = useCallback(() => {
    requestId.current += 1;
    setState('idle');
    setBundleView(null);
  }, []);
  const search = useCallback(
    async (input: string) => {
      const id = ++requestId.current;
      const kind = classifyWalletSearch(input, ownAddresses);
      if (kind === 'empty' || kind === 'own') {
        clear();
        return;
      }
      if (kind === 'invalid') {
        setState('invalid');
        return;
      }
      setState('loading');
      try {
        const result = await getUserByWallet(input.trim(), {
          verifiedOnly: true,
        });
        if (id !== requestId.current) return;
        setBundleView(
          result.user_id === ownUserId
            ? null
            : { userId: result.user_id, matchedAddress: input.trim() },
        );
        setState('idle');
      } catch (error) {
        if (id !== requestId.current) return;
        setState(
          error &&
            typeof error === 'object' &&
            'status' in error &&
            error.status === 404
            ? 'notFound'
            : 'error',
        );
      }
    },
    [clear, ownAddresses, ownUserId],
  );
  return { state, search, clear };
}
