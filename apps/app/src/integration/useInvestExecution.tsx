import { useStrategyDepositWizard } from '@zapengine/app-core/hooks/useStrategyDepositWizard';
import type { StrategyDepositWizardState } from '@zapengine/app-core/lib/wallet/strategyDepositMachine';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import type { DepositExecutionCapability } from '@/integration/investExecutionModel';
import { useInvest } from '@/integration/useInvest';

export interface InvestExecutionContextValue {
  wizard: StrategyDepositWizardState;
  pending: boolean;
  capability: DepositExecutionCapability;
  startFromDraft: () => Promise<void>;
  advance: () => Promise<void>;
  retry: () => void;
  reset: () => void;
}

const InvestExecutionContext =
  createContext<InvestExecutionContextValue | null>(null);

export function InvestExecutionProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletProvider();
  const queryClient = useQueryClient();
  const { totalUsd6, baseFundingToken, arbitrumFundingToken } = useInvest();
  const { wizard, pending, start, advance, retry, reset } =
    useStrategyDepositWizard();
  const invalidatedDone = useRef(false);
  const walletAddress = wallet.account?.address;

  const capability: DepositExecutionCapability = wallet.isConnected
    ? 'ready'
    : 'connect-wallet';

  const startFromDraft = useCallback(async () => {
    if (!walletAddress || totalUsd6 === '0') return;
    invalidatedDone.current = false;
    await start({
      userAddress: walletAddress as `0x${string}`,
      totalUsd6,
      fundingSources: [
        { chainId: 8453, fromToken: baseFundingToken.depositAddress },
        { chainId: 42161, fromToken: arbitrumFundingToken.depositAddress },
      ],
    });
  }, [
    arbitrumFundingToken.depositAddress,
    baseFundingToken.depositAddress,
    start,
    totalUsd6,
    walletAddress,
  ]);

  useEffect(() => {
    if (wizard.status !== 'done' || invalidatedDone.current) return;
    invalidatedDone.current = true;
    void queryClient.invalidateQueries({ queryKey: ['desktop'] });
  }, [queryClient, wizard.status]);

  const value = useMemo<InvestExecutionContextValue>(
    () => ({
      wizard,
      pending,
      capability,
      startFromDraft,
      advance,
      retry,
      reset,
    }),
    [wizard, pending, capability, startFromDraft, advance, retry, reset],
  );

  return (
    <InvestExecutionContext.Provider value={value}>
      {children}
    </InvestExecutionContext.Provider>
  );
}

export function useInvestExecution(): InvestExecutionContextValue {
  const context = useContext(InvestExecutionContext);
  if (!context) {
    throw new Error(
      'useInvestExecution must be used within an InvestExecutionProvider',
    );
  }
  return context;
}
