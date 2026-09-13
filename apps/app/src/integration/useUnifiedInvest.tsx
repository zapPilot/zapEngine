import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import {
  DEFAULT_UNIFIED_INVEST_ALLOCATION,
  type UnifiedInvestAllocation,
  type UnifiedInvestTargetId,
} from '@/integration/unifiedInvestModel';

export interface UnifiedInvestContextValue {
  allocation: UnifiedInvestAllocation;
  setAllocation: (allocation: UnifiedInvestAllocation) => void;
  setTargetBps: (target: UnifiedInvestTargetId, bps: number) => void;
  resetAllocation: () => void;
}

const UnifiedInvestContext = createContext<UnifiedInvestContextValue | null>(
  null,
);

export function UnifiedInvestProvider({ children }: { children: ReactNode }) {
  const [allocation, setAllocationState] = useState<UnifiedInvestAllocation>(
    DEFAULT_UNIFIED_INVEST_ALLOCATION,
  );

  const setAllocation = useCallback((next: UnifiedInvestAllocation) => {
    setAllocationState(next);
  }, []);

  const setTargetBps = useCallback(
    (target: UnifiedInvestTargetId, bps: number) => {
      const normalized = Math.max(0, Math.min(10_000, Math.round(bps)));
      setAllocationState((current) => ({
        ...current,
        [`${target}Bps`]: normalized,
      }));
    },
    [],
  );

  const resetAllocation = useCallback(() => {
    setAllocationState(DEFAULT_UNIFIED_INVEST_ALLOCATION);
  }, []);

  const value = useMemo<UnifiedInvestContextValue>(
    () => ({ allocation, setAllocation, setTargetBps, resetAllocation }),
    [allocation, resetAllocation, setAllocation, setTargetBps],
  );

  return (
    <UnifiedInvestContext.Provider value={value}>
      {children}
    </UnifiedInvestContext.Provider>
  );
}

export function useUnifiedInvest(): UnifiedInvestContextValue {
  const context = useContext(UnifiedInvestContext);
  if (!context) {
    throw new Error('useUnifiedInvest must be used within UnifiedInvestProvider');
  }
  return context;
}
