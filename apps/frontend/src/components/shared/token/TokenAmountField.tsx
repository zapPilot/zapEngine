import { cn } from '@zapengine/app-core/lib/ui/classNames';
import { formatCurrency, formatNumber } from '@zapengine/app-core/utils';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { NumericInput } from '@/components/ui/NumericInput';

type Denomination = 'usd' | 'token';

export interface TokenAmountFieldToken {
  symbol: string;
  decimals: number;
}

export interface TokenAmountFieldProps {
  amount: string;
  onAmountChange: (tokenAmount: string) => void;
  token: TokenAmountFieldToken | null;
  usdPrice?: number | undefined;
  balance?: number | undefined;
  percentages?: number[];
  disabled?: boolean;
  className?: string;
}

const DEFAULT_PERCENTAGES = [0.25, 0.5, 0.75, 1];

function trimTrailingZeros(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function formatDecimalValue(
  value: number,
  maximumFractionDigits: number,
): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  return trimTrailingZeros(value.toFixed(maximumFractionDigits));
}

function parseDecimal(value: string): number | null {
  if (!value || value === '.') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPercentageFractionDigits(
  token: TokenAmountFieldToken | null,
): number {
  return Math.min(token?.decimals ?? 6, 8);
}

function getConversionFractionDigits(
  token: TokenAmountFieldToken | null,
): number {
  return Math.min(token?.decimals ?? 18, 18);
}

function hasUsableUsdPrice(
  token: TokenAmountFieldToken | null,
  usdPrice: number | undefined,
): boolean {
  return Boolean(token && usdPrice !== undefined && usdPrice > 0);
}

function deriveDisplayAmount(
  tokenAmount: string,
  denomination: Denomination,
  token: TokenAmountFieldToken | null,
  usdPrice: number | undefined,
): string {
  if (denomination === 'token') {
    return tokenAmount;
  }

  const parsedTokenAmount = parseDecimal(tokenAmount);
  if (
    parsedTokenAmount === null ||
    usdPrice === undefined ||
    !hasUsableUsdPrice(token, usdPrice)
  ) {
    return '';
  }

  return formatDecimalValue(parsedTokenAmount * usdPrice, 8);
}

function formatPercentageAmount(
  balance: number,
  percentage: number,
  token: TokenAmountFieldToken | null,
): string {
  if (percentage === 1) {
    return balance.toString();
  }

  return formatDecimalValue(
    balance * percentage,
    getPercentageFractionDigits(token),
  );
}

export function TokenAmountField({
  amount,
  onAmountChange,
  token,
  usdPrice,
  balance,
  percentages = DEFAULT_PERCENTAGES,
  disabled = false,
  className,
}: TokenAmountFieldProps) {
  const initialDenomination: Denomination = hasUsableUsdPrice(token, usdPrice)
    ? 'usd'
    : 'token';
  const [denomination, setDenomination] =
    useState<Denomination>(initialDenomination);
  const [displayAmount, setDisplayAmount] = useState(() =>
    deriveDisplayAmount(amount, initialDenomination, token, usdPrice),
  );
  const userSelectedDenomination = useRef(false);
  const lastEmittedAmount = useRef<string | null>(null);
  const lastDisplayContext = useRef({
    denomination,
    usdPrice,
    decimals: token?.decimals,
  });
  const amountInputId = useId();

  const hasUsdPrice = hasUsableUsdPrice(token, usdPrice);
  const hasBalance = balance !== undefined && Number.isFinite(balance);
  const tokenSymbol = token?.symbol ?? 'Token';
  const tokenAmountNumber = parseDecimal(amount) ?? 0;

  useEffect(() => {
    if (!hasUsdPrice) {
      userSelectedDenomination.current = false;
      if (denomination !== 'token') {
        setDenomination('token');
      }
      setDisplayAmount(deriveDisplayAmount(amount, 'token', token, usdPrice));
      return;
    }

    if (!userSelectedDenomination.current && denomination !== 'usd') {
      setDenomination('usd');
      setDisplayAmount(deriveDisplayAmount(amount, 'usd', token, usdPrice));
    }
  }, [amount, denomination, hasUsdPrice, token, usdPrice]);

  useEffect(() => {
    const contextChanged =
      lastDisplayContext.current.denomination !== denomination ||
      lastDisplayContext.current.usdPrice !== usdPrice ||
      lastDisplayContext.current.decimals !== token?.decimals;

    lastDisplayContext.current = {
      denomination,
      usdPrice,
      decimals: token?.decimals,
    };

    if (amount === lastEmittedAmount.current && !contextChanged) {
      return;
    }

    setDisplayAmount(
      deriveDisplayAmount(amount, denomination, token, usdPrice),
    );
  }, [amount, denomination, token, usdPrice]);

  const helperText = useMemo(() => {
    if (!token) {
      return 'Select token';
    }

    if (denomination === 'usd') {
      return `≈ ${formatNumber(tokenAmountNumber, {
        smartPrecision: true,
      })} ${token.symbol}`;
    }

    if (!hasUsdPrice || usdPrice === undefined) {
      return '≈ -';
    }

    return `≈ ${formatCurrency(tokenAmountNumber * usdPrice, {
      smartPrecision: true,
    })}`;
  }, [denomination, hasUsdPrice, token, tokenAmountNumber, usdPrice]);

  const balanceLabel =
    hasBalance && token
      ? `Balance: ${formatNumber(balance, { smartPrecision: true })} ${
          token.symbol
        }`
      : 'Balance: -';

  const emitTokenAmount = (tokenAmount: string): void => {
    lastEmittedAmount.current = tokenAmount;
    onAmountChange(tokenAmount);
  };

  const handleInputChange = (value: string): void => {
    setDisplayAmount(value);

    if (denomination === 'token') {
      emitTokenAmount(value);
      return;
    }

    const parsedUsdAmount = parseDecimal(value);
    if (parsedUsdAmount === null || !hasUsdPrice || usdPrice === undefined) {
      emitTokenAmount('');
      return;
    }

    emitTokenAmount(
      formatDecimalValue(
        parsedUsdAmount / usdPrice,
        getConversionFractionDigits(token),
      ),
    );
  };

  const handleDenominationSelect = (nextDenomination: Denomination): void => {
    if (!token || disabled) {
      return;
    }

    if (nextDenomination === 'usd' && !hasUsdPrice) {
      return;
    }

    userSelectedDenomination.current = true;
    setDenomination(nextDenomination);
    setDisplayAmount(
      deriveDisplayAmount(amount, nextDenomination, token, usdPrice),
    );
  };

  const handlePercentageSelect = (percentage: number): void => {
    if (
      !token ||
      disabled ||
      balance === undefined ||
      !Number.isFinite(balance)
    ) {
      return;
    }

    const nextTokenAmount = formatPercentageAmount(balance, percentage, token);
    emitTokenAmount(nextTokenAmount);
    setDisplayAmount(
      deriveDisplayAmount(nextTokenAmount, denomination, token, usdPrice),
    );
  };

  return (
    <div className={cn('group space-y-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={amountInputId}
          className="block text-xs font-medium text-gray-500 uppercase tracking-wide group-focus-within:text-indigo-500 transition-colors"
        >
          Amount
        </label>
        <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500 truncate">
          {balanceLabel}
        </span>
      </div>

      <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 pb-2 group-focus-within:border-indigo-500 transition-all">
        <NumericInput
          id={amountInputId}
          value={displayAmount}
          onChange={handleInputChange}
          className="bg-transparent text-3xl font-light text-gray-900 dark:text-white w-full min-w-0 outline-none placeholder:text-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="0.00"
          disabled={disabled}
          aria-label="Amount"
        />

        <div className="inline-flex shrink-0 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-0.5">
          <button
            type="button"
            onClick={() => handleDenominationSelect('usd')}
            disabled={disabled || !token || !hasUsdPrice}
            aria-pressed={denomination === 'usd'}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              denomination === 'usd'
                ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            )}
          >
            USD
          </button>
          <button
            type="button"
            onClick={() => handleDenominationSelect('token')}
            disabled={disabled || !token}
            aria-pressed={denomination === 'token'}
            className={cn(
              'max-w-20 truncate px-2.5 py-1 text-xs font-semibold rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              denomination === 'token'
                ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            )}
          >
            {tokenSymbol}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {percentages.map((percentage) => (
          <button
            key={percentage}
            type="button"
            onClick={() => handlePercentageSelect(percentage)}
            disabled={disabled || !token || !hasBalance}
            className="min-w-14 flex-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-100 dark:hover:border-gray-700 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {percentage === 1 ? 'MAX' : `${percentage * 100}%`}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-gray-400 dark:text-gray-500">
        <span className="tabular-nums">{helperText}</span>
      </div>
    </div>
  );
}
