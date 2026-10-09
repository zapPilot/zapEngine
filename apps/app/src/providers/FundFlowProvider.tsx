import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { InvestProvider, useInvest } from '@/integration/useInvest';
import {
  InvestExecutionProvider,
  useInvestExecution,
} from '@/integration/useInvestExecution';
import { chainBatchDrafts } from '@/integration/investTargetsModel';
import { useInvestReview } from '@/integration/useInvestReview';
import { useAccount } from '@/integration/useAccount';
import {
  deriveFundStep,
  fundReviewExpiry,
  deriveFundSignRequest,
  type FundStep,
  type SignRequest,
} from '@/integration/fundFlowModel';

export interface FundFlowValue {
  available: boolean;
  visible: boolean;
  step: FundStep;
  open: (options?: { fresh?: boolean }) => void;
  close: () => void;
  signRequest: SignRequest | null;
}
interface ControllerState {
  complete: boolean;
  needsAgent: boolean;
}
const INITIAL_CONTROLLER: ControllerState = {
  complete: false,
  needsAgent: false,
};
const FundContext = createContext<FundFlowValue | null>(null);
const ControllerContext = createContext<{
  ownerValid: boolean;
  ownerKey: string;
  report: (state: ControllerState) => void;
} | null>(null);

function FundFlowState({ children }: { children: ReactNode }) {
  const account = useAccount();
  const invest = useInvest();
  const execution = useInvestExecution();
  // This disabled observer keeps the exact reviewed quote alive while the sheet is closed.
  const review = useInvestReview({ autoReview: false });
  const ownerKey = account.isConnected
    ? `${account.userId ?? ''}:${account.address?.toLowerCase() ?? ''}`
    : '';
  const [committedOwner, setCommittedOwner] = useState(ownerKey);
  const ownerValid = committedOwner === ownerKey;
  const [visible, setVisible] = useState(false);
  const [controller, setController] = useState(INITIAL_CONTROLLER);
  const pendingOpen = useRef<{ address: string | null; fresh: boolean } | null>(
    null,
  );
  const live = useRef({
    account,
    ownerValid,
    controller,
    execution,
    invest,
    review,
  });
  useLayoutEffect(() => {
    live.current = {
      account,
      ownerValid,
      controller,
      execution,
      invest,
      review,
    };
  }, [account, ownerValid, controller, execution, invest, review]);
  const hasFrozenDraft =
    ownerValid &&
    (invest.stageDrafts.length > 0 || invest.hyperCoreFundingDraft !== null);
  const progress = ownerValid ? execution.reviewedProgress : null;
  const actualVisible = visible && ownerValid;
  const step = deriveFundStep({
    hasFrozenDraft,
    hasProgress: progress !== null,
  });
  const nextReview =
    progress?.phase === 'checkpoint'
      ? execution.reviewedQueue[progress.groupIndex + 1]?.review
      : null;
  const expiresAt =
    progress?.phase === 'checkpoint'
      ? fundReviewExpiry(nextReview ? [nextReview] : [], 1)
      : fundReviewExpiry(
          review.batches.map((batch) => batch.review),
          chainBatchDrafts(invest.stageDrafts).length,
        );
  const signRequest = useMemo(
    () =>
      deriveFundSignRequest({
        visible: actualVisible,
        hasFrozenDraft,
        amountUsd: ownerValid ? invest.amountUsd : 0,
        phase: progress?.phase ?? null,
        expiresAt,
        needsAgent: ownerValid && controller.needsAgent,
      }),
    [
      actualVisible,
      hasFrozenDraft,
      invest.amountUsd,
      ownerValid,
      progress?.phase,
      expiresAt,
      controller.needsAgent,
    ],
  );
  const close = useCallback(() => setVisible(false), []);
  const open = useCallback((options?: { fresh?: boolean }) => {
    const current = live.current;
    if (!current.account.isConnected || !current.account.address) return;
    if (
      !current.ownerValid ||
      !current.account.userId ||
      current.account.loadingUser
    ) {
      pendingOpen.current = {
        address: current.account.address,
        fresh: options?.fresh === true,
      };
      return;
    }
    const phase = current.execution.reviewedProgress?.phase;
    const running =
      phase !== undefined &&
      phase !== 'failed' &&
      !(phase === 'complete' && current.controller.complete);
    const frozen =
      current.invest.stageDrafts.length > 0 ||
      current.invest.hyperCoreFundingDraft !== null;
    if (options?.fresh && !running && !(phase === undefined && frozen)) {
      current.invest.resetDraft();
      current.execution.reset();
      setController(INITIAL_CONTROLLER);
    }
    const expiry = current.review.batches.length
      ? Math.min(
          ...current.review.batches.map((batch) => batch.review.expiresAt),
        )
      : null;
    setVisible(true);
    if (phase === undefined && expiry !== null && expiry <= Date.now())
      void current.review.refresh();
  }, []);
  if (!ownerValid) {
    setCommittedOwner(ownerKey);
    setVisible(false);
    setController(INITIAL_CONTROLLER);
  }
  const { resetDraft } = invest;
  const { reset: resetExecution } = execution;
  useLayoutEffect(() => {
    resetDraft();
    resetExecution();
  }, [ownerKey, resetDraft, resetExecution]);
  useEffect(() => {
    if (!account.isConnected) pendingOpen.current = null;
    const pending = pendingOpen.current;
    if (!pending) return;
    if (pending.address !== account.address) {
      pendingOpen.current = null;
      return;
    }
    if (account.isConnected && account.userId && !account.loadingUser) {
      pendingOpen.current = null;
      open({ fresh: pending.fresh });
    }
  }, [
    ownerKey,
    ownerValid,
    account.address,
    account.isConnected,
    account.userId,
    account.loadingUser,
    open,
  ]);
  const currentOwner = useRef(ownerKey);
  useLayoutEffect(() => {
    currentOwner.current = ownerKey;
  }, [ownerKey]);
  const report = useCallback(
    (state: ControllerState) => {
      if (currentOwner.current !== ownerKey) return;
      setController((previous) =>
        previous.complete === state.complete &&
        previous.needsAgent === state.needsAgent
          ? previous
          : state,
      );
    },
    [ownerKey],
  );
  const value = useMemo<FundFlowValue>(
    () => ({
      available: true,
      visible: actualVisible,
      step,
      open,
      close,
      signRequest,
    }),
    [actualVisible, step, open, close, signRequest],
  );
  const controllerValue = useMemo(
    () => ({ ownerKey, ownerValid, report }),
    [ownerKey, ownerValid, report],
  );
  return (
    <FundContext.Provider value={value}>
      <ControllerContext.Provider value={controllerValue}>
        {children}
      </ControllerContext.Provider>
    </FundContext.Provider>
  );
}
export function FundFlowProvider({ children }: { children: ReactNode }) {
  return (
    <InvestProvider>
      <InvestExecutionProvider>
        <FundFlowState>{children}</FundFlowState>
      </InvestExecutionProvider>
    </InvestProvider>
  );
}
export function useFundFlow() {
  const value = useContext(FundContext);
  if (!value)
    throw new Error('useFundFlow must be used within FundFlowProvider');
  return value;
}
export function useFundControllerState() {
  const value = useContext(ControllerContext);
  if (!value)
    throw new Error(
      'The Fund controller must be mounted inside FundFlowProvider',
    );
  return value;
}
