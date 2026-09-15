import {
  DEFAULT_SECTOR_WEIGHTS,
  rebalanceSectorWeights,
  resolveTargetAllocations,
  type SectorWeights,
  type InvestSectorId,
} from '@/integration/investSectorModel';
import type { FundingPreferences } from '@/integration/investFundingPlanner';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import {
  type DepositTokenSymbol,
  type StrategyFundingChainId,
} from '@/integration/depositTokens';
import {
  amountInputToUsd6,
  amountUsdFromInput,
} from '@/integration/investAmountModel';
import {
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
  sectorWeights: SectorWeights;
  setSectorWeight: (sectorId: InvestSectorId, weightBps: number) => void;
  resetSectorWeights: () => void;
  fundingPreferences: FundingPreferences;
  setFundingPreference: (
    chainId: StrategyFundingChainId,
    symbol: DepositTokenSymbol | null,
  ) => void;
  clearFundingPreferences: () => void;
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
  const [sectorWeights, setSectorWeights] = useState(DEFAULT_SECTOR_WEIGHTS);
  const targetAllocations = useMemo(
    () => resolveTargetAllocations(sectorWeights),
    [sectorWeights],
  );
  const [fundingPreferences, setFundingPreferences] =
    useState<FundingPreferences>({});
  const amountUsd = amountUsdFromInput(amountInput) ?? 0;
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
  const setSectorWeight = useCallback(
    (id: InvestSectorId, bps: number) => {
      setSectorWeights((current) => rebalanceSectorWeights(current, id, bps));
      clearFrozenExecution();
    },
    [clearFrozenExecution],
  );
  const resetSectorWeights = useCallback(
    () =>
      withFreezeClear(
        setSectorWeights,
        clearFrozenExecution,
        DEFAULT_SECTOR_WEIGHTS,
      ),
    [clearFrozenExecution],
  );
  const setFundingPreference = useCallback(
    (chainId: StrategyFundingChainId, symbol: DepositTokenSymbol | null) => {
      setFundingPreferences((current) => {
        const next = { ...current };
        if (symbol) next[chainId] = symbol;
        else delete next[chainId];
        return next;
      });
      clearFrozenExecution();
    },
    [clearFrozenExecution],
  );
  const clearFundingPreferences = useCallback(
    () => withFreezeClear(setFundingPreferences, clearFrozenExecution, {}),
    [clearFrozenExecution],
  );

  const value = useMemo<InvestContextValue>(
    () => ({
      amountUsd,
      amountInput,
      setAmountInput,
      totalUsd6: amountInputToUsd6(amountInput),
      targetAllocations,
      sectorWeights,
      setSectorWeight,
      resetSectorWeights,
      fundingPreferences,
      setFundingPreference,
      clearFundingPreferences,
      stageDrafts,
      setStageDrafts: setStageDraftsState,
      hyperCoreFundingDraft,
      setHyperCoreFundingDraft,
      hlpBaselineUsd6,
      setHlpBaselineUsd6,
    }),
    [
      sectorWeights,
      setSectorWeight,
      resetSectorWeights,
      fundingPreferences,
      setFundingPreference,
      clearFundingPreferences,
      amountInput,
      amountUsd,
      hlpBaselineUsd6,
      hyperCoreFundingDraft,
      setAmountInput,
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
