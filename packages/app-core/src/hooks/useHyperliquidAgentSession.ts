import { useAbortControllerRef } from '@core/hooks/useAbortControllerRef';
import { extractErrorMessage } from '@core/lib/errors';
import {
  hyperliquidAgentReducer,
  type HyperliquidAgentSessionStatus,
  initialHyperliquidAgentState,
} from '@core/lib/wallet/hyperliquidAgentMachine';
import { useWalletProvider } from '@core/providers/walletContext';
import {
  approveNewHyperliquidAgent,
  type HyperliquidAgentRecord,
  hyperliquidAgentSigner,
  loadApprovedHyperliquidAgent,
} from '@core/services/hyperliquidAgentService';
import type { HyperliquidAgentKeyStore } from '@core/types/domain/wallet';
import type { HyperliquidSigning } from '@zapengine/types/api';
import { equalsAddress } from '@zapengine/types/shared';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Address, LocalAccount, WalletClient } from 'viem';

export { type HyperliquidAgentSessionStatus };

export interface HyperliquidAgentSession {
  status: HyperliquidAgentSessionStatus;
  masterAddress: Address | null;
  agentAddress: Address | null;
  error: string | null;
  isReady: boolean;
  approve(): Promise<void>;
  refresh(): Promise<void>;
  getSigner(expectedMaster: Address): Promise<LocalAccount>;
}

export function useHyperliquidAgentSession({
  keyStore,
  signing,
}: {
  keyStore: HyperliquidAgentKeyStore;
  signing: HyperliquidSigning | null;
}): HyperliquidAgentSession {
  const { account, getWalletClient } = useWalletProvider();
  const [state, dispatch] = useReducer(
    hyperliquidAgentReducer,
    initialHyperliquidAgentState,
  );
  const { ref: abortRef, renew } = useAbortControllerRef();
  const recordRef = useRef<HyperliquidAgentRecord | null>(null);
  const approvalInFlightRef = useRef(false);

  const master = account?.address as Address | undefined;

  const refresh = useCallback(async () => {
    if (!master || !signing) {
      abortRef.current?.abort();
      recordRef.current = null;
      dispatch({ type: 'RESET' });
      return;
    }

    const controller = renew();
    dispatch({ type: 'CHECK_STARTED', master });
    try {
      const record = await loadApprovedHyperliquidAgent({
        keyStore,
        masterAddress: master,
        signing,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      recordRef.current = record;
      dispatch({
        type: 'CHECK_RESOLVED',
        master,
        agentAddress: record?.address ?? null,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      recordRef.current = null;
      dispatch({
        type: 'FAILED',
        master,
        message: extractErrorMessage(
          error,
          'Unable to check Hyperliquid signing',
        ),
      });
    }
  }, [abortRef, keyStore, master, renew, signing]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const approve = useCallback(async () => {
    if (!master || !signing) {
      throw new Error('Connect the wallet for this Hyperliquid deposit first');
    }
    if (approvalInFlightRef.current) {
      throw new Error('Hyperliquid signing approval is already in progress');
    }

    approvalInFlightRef.current = true;
    const controller = renew();
    dispatch({ type: 'CHECK_STARTED', master });
    dispatch({ type: 'APPROVE_STARTED', master });
    try {
      const walletClient = await getWalletClient();
      if (controller.signal.aborted) return;
      if (!equalsAddress(walletClient.account.address, master)) {
        throw new Error(
          'The connected wallet changed. Reconnect the wallet for this deposit.',
        );
      }

      const record = await approveNewHyperliquidAgent({
        keyStore,
        masterAddress: master,
        signing,
        signal: controller.signal,
        walletClient: walletClient as WalletClient,
      });
      if (controller.signal.aborted) return;
      recordRef.current = record;
      dispatch({
        type: 'APPROVE_RESOLVED',
        master,
        agentAddress: record.address,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      recordRef.current = null;
      const message = extractErrorMessage(
        error,
        'Unable to enable Hyperliquid signing',
      );
      dispatch({ type: 'FAILED', master, message });
      throw error;
    } finally {
      approvalInFlightRef.current = false;
    }
  }, [getWalletClient, keyStore, master, renew, signing]);

  const getSigner = useCallback(
    async (expectedMaster: Address): Promise<LocalAccount> => {
      if (
        state.status !== 'ready' ||
        !state.masterAddress ||
        !equalsAddress(state.masterAddress, expectedMaster) ||
        !master ||
        !equalsAddress(master, expectedMaster)
      ) {
        throw new Error('Enable Hyperliquid signing for this wallet first');
      }
      const record = recordRef.current;
      if (
        !record ||
        !state.agentAddress ||
        !equalsAddress(record.address, state.agentAddress)
      ) {
        throw new Error('Enable Hyperliquid signing for this wallet first');
      }
      return hyperliquidAgentSigner(record);
    },
    [master, state.agentAddress, state.masterAddress, state.status],
  );

  const isReady = Boolean(
    state.status === 'ready' &&
    master &&
    state.masterAddress &&
    equalsAddress(master, state.masterAddress),
  );

  return useMemo(
    () => ({
      ...state,
      isReady,
      approve,
      refresh,
      getSigner,
    }),
    [approve, getSigner, isReady, refresh, state],
  );
}
