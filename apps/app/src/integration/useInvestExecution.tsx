import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import type { DepositWizardState } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import {
  buildWizardStartInput,
  type DepositExecutionCapability,
  resolveDepositExecutionCapability,
} from '@/integration/investExecutionModel';
import { useInvest } from '@/integration/useInvest';

export interface InvestExecutionContextValue {
  wizard: DepositWizardState;
  pending: boolean;
  capability: DepositExecutionCapability;
  /**
   * Kicks off the wizard from the current invest draft. Errors surface via
   * `wizard.error`, so callers fire-and-forget (`void startFromDraft()`).
   */
  startFromDraft: () => Promise<void>;
  runHlpDeposit: () => Promise<void>;
  retry: () => void;
  reset: () => void;
}

const InvestExecutionContext =
  createContext<InvestExecutionContextValue | null>(null);

/**
 * Holds the deposit-wizard execution state so the confirm and progress steps
 * share one live wizard. Sits inside InvestProvider (needs the draft) but
 * stays separate so high-frequency polling updates don't re-render the
 * amount/route screens through the draft context.
 */
export function InvestExecutionProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletProvider();
  const { selectedDepositPath, fromToken, fromAmount } = useInvest();
  const { wizard, pending, start, runHlpDeposit, retry, reset } =
    useDepositWizard();

  const capability = resolveDepositExecutionCapability({
    isConnected: wallet.isConnected,
    executionMode: wallet.executionMode,
    depositPath: selectedDepositPath,
  });

  const startFromDraft = useCallback(async () => {
    const input = buildWizardStartInput({
      depositPath: selectedDepositPath,
      fromToken,
      fromAmount,
    });
    if (!input) {
      return;
    }
    try {
      await start(input);
    } catch {
      // Surfaced through wizard.error; swallowing keeps the CTA fire-and-forget.
    }
  }, [selectedDepositPath, fromToken, fromAmount, start]);

  const value = useMemo<InvestExecutionContextValue>(
    () => ({
      wizard,
      pending,
      capability,
      startFromDraft,
      runHlpDeposit,
      retry,
      reset,
    }),
    [wizard, pending, capability, startFromDraft, runHlpDeposit, retry, reset],
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
