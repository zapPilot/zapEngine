import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import {
  DEFAULT_ARBITRUM_FUNDING_TOKEN,
  DEFAULT_BASE_FUNDING_TOKEN,
  type DesktopDepositToken,
} from '@/integration/depositTokens';
import {
  amountInputToUsd6,
  amountUsdFromInput,
} from '@/integration/investAmountModel';
import {
  DEFAULT_TARGET_ALLOCATIONS,
  type InvestPositionId,
  type StageDraft,
  type TargetAllocation,
} from '@/integration/investTargetsModel';

/**
 * Frozen HLP draft funded from HyperCore rather than an EVM chain. Kept
 * separate from `StageDraft`, which carries a source chain id and token
 * address that a HyperCore-funded deposit simply does not have.
 */
export interface HyperCoreFundingDraft {
  source: 'hypercore-spot';
  requestedUsd6: string;
}

export interface InvestContextValue {
  /** USD amount the user is investing (entered in step 1). */
  amountUsd: number;
  amountInput: string;
  setAmountInput: (value: string) => void;
  totalUsd6: string;
  /** Target weights per destination; always one entry per `INVEST_POSITIONS`. */
  targetAllocations: readonly TargetAllocation[];
  setTargetWeight: (positionId: InvestPositionId, weightBps: number) => void;
  resetTargetAllocations: () => void;
  baseFundingToken: DesktopDepositToken;
  setBaseFundingToken: (value: DesktopDepositToken) => void;
  arbitrumFundingToken: DesktopDepositToken;
  setArbitrumFundingToken: (value: DesktopDepositToken) => void;
  /** Stages frozen when the user leaves step 1; the review step reads only these. */
  stageDrafts: readonly StageDraft[];
  setStageDrafts: (value: readonly StageDraft[]) => void;
  hyperCoreFundingDraft: HyperCoreFundingDraft | null;
  setHyperCoreFundingDraft: (value: HyperCoreFundingDraft | null) => void;
  /** Perp USDC snapshot taken immediately before a reviewed HLP batch. */
  hlpBaselineUsd6: string | null;
  setHlpBaselineUsd6: (value: string | null) => void;
}

const InvestContext = createContext<InvestContextValue | null>(null);

// Wraps a plain state setter so any further edit to the draft drops the
// frozen stages and baseline computed for the previous input.
function withFreezeClear<T>(
  setter: (value: T) => void,
  clearFrozenExecution: () => void,
  value: T,
): void {
  setter(value);
  clearFrozenExecution();
}

/**
 * Holds the invest-flow draft (amount, target weights, funding tokens) so the
 * amount, route, and progress steps share one source of truth. Wrapped around
 * the `/invest/*` routes via a layout route.
 */
export function InvestProvider({ children }: { children: ReactNode }) {
  const [amountInput, setAmountInputState] = useState('');
  const [targetAllocations, setTargetAllocations] = useState<
    readonly TargetAllocation[]
  >(DEFAULT_TARGET_ALLOCATIONS);
  const amountUsd = amountUsdFromInput(amountInput) ?? 0;
  const [baseFundingToken, setBaseFundingTokenState] =
    useState<DesktopDepositToken>(DEFAULT_BASE_FUNDING_TOKEN);
  const [arbitrumFundingToken, setArbitrumFundingTokenState] =
    useState<DesktopDepositToken>(DEFAULT_ARBITRUM_FUNDING_TOKEN);
  const [stageDrafts, setStageDraftsState] = useState<readonly StageDraft[]>(
    [],
  );
  const [hyperCoreFundingDraft, setHyperCoreFundingDraft] =
    useState<HyperCoreFundingDraft | null>(null);
  const [hlpBaselineUsd6, setHlpBaselineUsd6] = useState<string | null>(null);

  const clearFrozenExecution = useCallback(() => {
    setStageDraftsState([]);
    setHyperCoreFundingDraft(null);
    setHlpBaselineUsd6(null);
  }, []);
  const setAmountInput = useCallback(
    (value: string) =>
      withFreezeClear(setAmountInputState, clearFrozenExecution, value),
    [clearFrozenExecution],
  );
  const setTargetWeight = useCallback(
    (positionId: InvestPositionId, weightBps: number) => {
      setTargetAllocations((current) =>
        current.map((entry) =>
          entry.positionId === positionId ? { ...entry, weightBps } : entry,
        ),
      );
      clearFrozenExecution();
    },
    [clearFrozenExecution],
  );
  const resetTargetAllocations = useCallback(
    () =>
      withFreezeClear(
        setTargetAllocations,
        clearFrozenExecution,
        DEFAULT_TARGET_ALLOCATIONS,
      ),
    [clearFrozenExecution],
  );
  const setBaseFundingToken = useCallback(
    (value: DesktopDepositToken) =>
      withFreezeClear(setBaseFundingTokenState, clearFrozenExecution, value),
    [clearFrozenExecution],
  );
  const setArbitrumFundingToken = useCallback(
    (value: DesktopDepositToken) =>
      withFreezeClear(
        setArbitrumFundingTokenState,
        clearFrozenExecution,
        value,
      ),
    [clearFrozenExecution],
  );

  const value = useMemo<InvestContextValue>(
    () => ({
      amountUsd,
      amountInput,
      setAmountInput,
      totalUsd6: amountInputToUsd6(amountInput),
      targetAllocations,
      setTargetWeight,
      resetTargetAllocations,
      baseFundingToken,
      setBaseFundingToken,
      arbitrumFundingToken,
      setArbitrumFundingToken,
      stageDrafts,
      setStageDrafts: setStageDraftsState,
      hyperCoreFundingDraft,
      setHyperCoreFundingDraft,
      hlpBaselineUsd6,
      setHlpBaselineUsd6,
    }),
    [
      amountInput,
      amountUsd,
      arbitrumFundingToken,
      baseFundingToken,
      hlpBaselineUsd6,
      hyperCoreFundingDraft,
      resetTargetAllocations,
      setAmountInput,
      setArbitrumFundingToken,
      setBaseFundingToken,
      setTargetWeight,
      stageDrafts,
      targetAllocations,
    ],
  );

  return (
    <InvestContext.Provider value={value}>{children}</InvestContext.Provider>
  );
}

export function useInvest(): InvestContextValue {
  const context = useContext(InvestContext);
  if (!context) {
    throw new Error('useInvest must be used within an InvestProvider');
  }
  return context;
}
