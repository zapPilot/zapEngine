import type { TokenBalanceQuery } from '@/hooks/queries/wallet/useTokenBalances';
import { cn } from '@/lib/ui/classNames';
import { formatCurrency, formatNumber } from '@/utils';

export interface TokenBalanceReadoutProps {
  query: TokenBalanceQuery | undefined;
  isConnected: boolean;
  className?: string;
}

export function TokenBalanceReadout({
  query,
  isConnected,
  className,
}: TokenBalanceReadoutProps) {
  if (!isConnected) {
    return (
      <span
        className={cn('text-xs text-gray-400 dark:text-gray-500', className)}
      >
        Connect wallet
      </span>
    );
  }

  if (!query || query.isPending) {
    return (
      <div className={cn('flex flex-col items-end gap-1.5', className)}>
        <div className="h-3.5 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-2.5 w-10 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <span
        className={cn(
          'text-sm tabular-nums text-gray-400 dark:text-gray-500',
          className,
        )}
      >
        &mdash;
      </span>
    );
  }

  return (
    <div className={cn('flex flex-col items-end leading-tight', className)}>
      <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
        {formatNumber(Number.parseFloat(query.data.balance), {
          smartPrecision: true,
        })}
      </span>
      <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
        {formatCurrency(query.data.usdValue, { smartPrecision: true })}
      </span>
    </div>
  );
}
