import {
  useSingleChainDepositWizard,
  type SingleChainDepositWizardStep,
} from '@zapengine/app-core/hooks/useSingleChainDepositWizard';
import { useStrategyDepositWizard } from '@zapengine/app-core/hooks/useStrategyDepositWizard';
import type {
  StrategyDepositWizardState,
  StrategyWizardStep,
} from '@zapengine/app-core/lib/wallet/strategyDepositMachine';
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

import {
  type DepositExecutionCapability,
  resolveInvestExecutionCapability,
} from '@/integration/investExecutionModel';
import {
  buildInvestDepositPlanRequest,
  useInvest,
} from '@/integration/useInvest';

export interface InvestExecutionContextValue {
  wizard: InvestExecutionWizardState;
  pending: boolean;
  capability: DepositExecutionCapability;
  mode: 'strategy' | 'single-chain';
  startFromDraft: () => Promise<void>;
  advance: () => Promise<void>;
  retry: () => void;
  reset: () => void;
}

export type InvestExecutionWizardStep =
  | StrategyWizardStep
  | SingleChainDepositWizardStep;

export interface InvestExecutionWizardState {
  steps: InvestExecutionWizardStep[];
  currentIndex: number;
  status: StrategyDepositWizardState['status'] | 'failed';
  error: string | null;
}

const InvestExecutionContext =
  createContext<InvestExecutionContextValue | null>(null);

export function InvestExecutionProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletProvider();
  const queryClient = useQueryClient();
  const {
    scope,
    totalUsd6,
    baseFundingToken,
    arbitrumFundingToken,
    singleChainFundingDraft,
  } = useInvest();
  const {
    wizard: strategyWizard,
    pending: strategyPending,
    start: startStrategy,
    advance: advanceStrategy,
    retry: retryStrategy,
    reset: resetStrategy,
  } = useStrategyDepositWizard();
  const {
    wizard: singleChainWizard,
    pending: singleChainPending,
    start: startSingleChain,
    advance: advanceSingleChain,
    retry: retrySingleChain,
    reset: resetSingleChain,
  } = useSingleChainDepositWizard();
  const invalidatedDone = useRef(false);
  const previousDraftKey = useRef('');
  const walletAddress = wallet.account?.address;
  const mode = scope === 'both' ? 'strategy' : 'single-chain';
  const singleChainDraftKey = singleChainFundingDraft
    ? [
        singleChainFundingDraft.scope,
        singleChainFundingDraft.chainId,
        singleChainFundingDraft.fromToken,
        singleChainFundingDraft.fromAmount,
        singleChainFundingDraft.scope === 'arbitrum'
          ? singleChainFundingDraft.marketKey
          : '',
      ].join(':')
    : 'none';
  const executionDraftKey = [
    scope,
    totalUsd6,
    baseFundingToken.depositAddress,
    arbitrumFundingToken.depositAddress,
    singleChainDraftKey,
  ].join('|');

  const capability = resolveInvestExecutionCapability({
    isConnected: wallet.isConnected,
    executionMode: wallet.executionMode,
    scope,
  });

  useEffect(() => {
    if (previousDraftKey.current === '') {
      previousDraftKey.current = executionDraftKey;
      return;
    }
    if (previousDraftKey.current === executionDraftKey) return;
    previousDraftKey.current = executionDraftKey;
    invalidatedDone.current = false;
    resetStrategy();
    resetSingleChain();
  }, [executionDraftKey, resetSingleChain, resetStrategy]);

  const startFromDraft = useCallback(async () => {
    if (!walletAddress || totalUsd6 === '0') return;
    invalidatedDone.current = false;
    const userAddress = walletAddress as `0x${string}`;
    const request = buildInvestDepositPlanRequest({
      userAddress,
      scope,
      totalUsd6,
      baseFundingToken,
      arbitrumFundingToken,
      singleChainFundingDraft,
    });
    if (request === null) return;

    if (request.kind === 'strategy') {
      const {
        kind: _kind,
        strategyId: _strategyId,
        ...strategyRequest
      } = request;
      void _kind;
      void _strategyId;
      await startStrategy(strategyRequest);
      return;
    }
    await startSingleChain(request);
  }, [
    arbitrumFundingToken,
    baseFundingToken,
    scope,
    singleChainFundingDraft,
    startSingleChain,
    startStrategy,
    totalUsd6,
    walletAddress,
  ]);

  const selectedWizard =
    mode === 'strategy' ? strategyWizard : singleChainWizard;
  const wizard = useMemo<InvestExecutionWizardState>(
    () => ({
      steps: selectedWizard.steps,
      currentIndex: selectedWizard.currentIndex,
      status: selectedWizard.status,
      error: selectedWizard.error,
    }),
    [selectedWizard],
  );
  const pending = mode === 'strategy' ? strategyPending : singleChainPending;
  const advance = mode === 'strategy' ? advanceStrategy : advanceSingleChain;
  const retry = mode === 'strategy' ? retryStrategy : retrySingleChain;
  const reset = useCallback(() => {
    invalidatedDone.current = false;
    resetStrategy();
    resetSingleChain();
  }, [resetSingleChain, resetStrategy]);

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
      mode,
      startFromDraft,
      advance,
      retry,
      reset,
    }),
    [wizard, pending, capability, mode, startFromDraft, advance, retry, reset],
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
