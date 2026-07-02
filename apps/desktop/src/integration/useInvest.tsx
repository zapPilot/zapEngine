import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';

import {
  DEFAULT_DEPOSIT_PATH,
  type DesktopDepositPath,
  isGmxDepositPath,
} from '@/integration/depositPaths';
import {
  DEFAULT_DEPOSIT_TOKEN,
  type DesktopDepositToken,
} from '@/integration/depositTokens';
import { useAccount } from '@/integration/useAccount';
import {
  type DepositPlanPreview,
  useDepositPlanPreview,
} from '@/integration/useDepositPlanPreview';

/** Convert a decimal token amount to a base-unit integer string. */
function toBaseUnits(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  const [whole = '0', fraction = ''] = value.toFixed(decimals).split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const baseUnits = `${whole}${paddedFraction}`.replace(/^0+(?=\d)/, '');
  return baseUnits || '0';
}

function toFromAmount(
  amountUsd: number,
  token: DesktopDepositToken,
  usdPrice: number | null,
): string {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return '0';
  }
  const price = token.symbol === 'USDC' ? (usdPrice ?? 1) : usdPrice;
  if (!price || price <= 0) {
    return '0';
  }
  return toBaseUnits(amountUsd / price, token.decimals);
}

export interface InvestContextValue {
  /** USD amount the user is investing (entered in step 1). */
  amountUsd: number;
  setAmountUsd: (value: number) => void;
  selectedToken: DesktopDepositToken;
  setSelectedToken: (value: DesktopDepositToken) => void;
  selectedDepositPath: DesktopDepositPath;
  setSelectedDepositPath: (value: DesktopDepositPath) => void;
  selectedTokenUsdPrice: number | null;
  setSelectedTokenUsdPrice: (value: number | null) => void;
  /** Source token for the deposit plan. */
  fromToken: `0x${string}`;
  sourceChainId: number;
  /** `amountUsd` converted to the selected token's base-unit decimal string. */
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
  const [selectedToken, setSelectedToken] = useState<DesktopDepositToken>(
    DEFAULT_DEPOSIT_TOKEN,
  );
  const [selectedDepositPath, setSelectedDepositPath] =
    useState<DesktopDepositPath>(DEFAULT_DEPOSIT_PATH);
  const [selectedTokenUsdPrice, setSelectedTokenUsdPrice] = useState<
    number | null
  >(1);

  const value = useMemo<InvestContextValue>(
    () => ({
      amountUsd,
      setAmountUsd,
      selectedToken,
      setSelectedToken,
      selectedDepositPath,
      setSelectedDepositPath,
      selectedTokenUsdPrice,
      setSelectedTokenUsdPrice,
      fromToken: selectedToken.depositAddress,
      sourceChainId: selectedDepositPath.chainId,
      fromAmount: isGmxDepositPath(selectedDepositPath)
        ? toBaseUnits(amountUsd, DEFAULT_DEPOSIT_TOKEN.decimals)
        : toFromAmount(amountUsd, selectedToken, selectedTokenUsdPrice),
    }),
    [amountUsd, selectedDepositPath, selectedToken, selectedTokenUsdPrice],
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

/**
 * Combines useAccount + useInvest + useDepositPlanPreview into one call.
 * Eliminates the duplicate useDepositPlanPreview call in InvestConfirmScreen and InvestRouteScreen.
 */
export function useInvestDepositPlanPreview(): DepositPlanPreview & {
  amountUsd: number;
  fromToken: `0x${string}`;
  fromAmount: string;
  sourceChainId: number;
  selectedDepositPath: DesktopDepositPath;
} {
  const { address } = useAccount();
  const {
    amountUsd,
    fromToken,
    fromAmount,
    sourceChainId,
    selectedDepositPath,
  } = useInvest();
  const result = useDepositPlanPreview({
    address,
    amountUsd,
    fromToken,
    fromAmount,
    sourceChainId,
    depositPath: selectedDepositPath,
  });
  return {
    ...result,
    amountUsd,
    fromToken,
    fromAmount,
    sourceChainId,
    selectedDepositPath,
  };
}
