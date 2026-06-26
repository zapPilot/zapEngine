import type { TokenBalanceQuery } from '@zapengine/app-core/hooks/queries/wallet/useTokenBalances';
import { cn } from '@zapengine/app-core/lib/ui/classNames';
import type { TransactionToken } from '@zapengine/app-core/types/domain/transaction';
import { memo, type ReactElement, useCallback } from 'react';

import { TokenBalanceReadout } from './TokenBalanceReadout';

export interface TokenSelectorRowProps {
  token: TransactionToken;
  selected: boolean;
  query: TokenBalanceQuery | undefined;
  isConnected: boolean;
  onSelect: (address: string) => void;
}

function TokenSelectorRowComponent({
  token,
  selected,
  query,
  isConnected,
  onSelect,
}: TokenSelectorRowProps): ReactElement {
  const handleSelect = useCallback(() => {
    onSelect(token.address);
  }, [onSelect, token.address]);

  return (
    <button
      type="button"
      onClick={handleSelect}
      aria-pressed={selected}
      className={cn(
        'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-all',
        selected
          ? 'border-indigo-500/60 bg-indigo-50/60 dark:bg-indigo-500/10 ring-1 ring-indigo-500/30'
          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50/70 dark:hover:bg-gray-800/40',
      )}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span
          className={cn(
            'w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
            selected
              ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
          )}
        >
          {token.symbol.charAt(0)}
        </span>
        <span className="flex flex-col min-w-0">
          <span
            className={cn(
              'text-sm font-semibold truncate',
              selected
                ? 'text-indigo-600 dark:text-indigo-300'
                : 'text-gray-900 dark:text-white',
            )}
          >
            {token.symbol}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
            {token.name}
          </span>
        </span>
      </span>
      <TokenBalanceReadout query={query} isConnected={isConnected} />
    </button>
  );
}

export const TokenSelectorRow = memo(TokenSelectorRowComponent);
TokenSelectorRow.displayName = 'TokenSelectorRow';
