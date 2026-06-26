import { BASE_CHAIN_ID, BASE_USDC_ADDRESS } from '@zapengine/types/api';
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';

/** USDC has 6 decimals; the deposit source token is Base USDC. */
const USDC_DECIMALS = 1_000_000;

/** Convert a USD amount (number) to a base-unit decimal string for USDC. */
function toFromAmount(amountUsd: number): string {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return '0';
  }
  return BigInt(Math.round(amountUsd * USDC_DECIMALS)).toString();
}

export interface InvestContextValue {
  /** USD amount the user is investing (entered in step 1). */
  amountUsd: number;
  setAmountUsd: (value: number) => void;
  /** Source token for the deposit plan — Base USDC. */
  fromToken: typeof BASE_USDC_ADDRESS;
  sourceChainId: typeof BASE_CHAIN_ID;
  /** `amountUsd` as a base-unit decimal string (USDC, 6 decimals). */
  fromAmount: string;
}

const InvestContext = createContext<InvestContextValue | null>(null);

/**
 * Holds the invest-flow draft (the USD amount) so the amount, route, and
 * confirm steps share one source of truth. Wrapped around the three
 * `/invest/*` routes via a layout route in `App`.
 */
export function InvestProvider({ children }: { children: ReactNode }) {
  const [amountUsd, setAmountUsd] = useState(0);

  const value = useMemo<InvestContextValue>(
    () => ({
      amountUsd,
      setAmountUsd,
      fromToken: BASE_USDC_ADDRESS,
      sourceChainId: BASE_CHAIN_ID,
      fromAmount: toFromAmount(amountUsd),
    }),
    [amountUsd],
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
