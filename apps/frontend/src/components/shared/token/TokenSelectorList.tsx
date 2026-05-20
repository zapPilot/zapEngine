import { type ReactElement, useCallback } from 'react';

import type { TokenBalanceQuery } from '@/hooks/queries/wallet/useTokenBalances';
import type { TransactionToken } from '@/types/domain/transaction';

import { TokenSelectorRow } from './TokenSelectorRow';

export interface TokenSelectorListProps {
  tokens: TransactionToken[];
  selectedAddress: string | undefined;
  balancesByAddress: Map<string, TokenBalanceQuery>;
  isConnected: boolean;
  isLoading: boolean;
  onSelect: (address: string) => void;
  limit?: number;
}

export function TokenSelectorList({
  tokens,
  selectedAddress,
  balancesByAddress,
  isConnected,
  isLoading,
  onSelect,
  limit = 8,
}: TokenSelectorListProps): ReactElement {
  const handleSelect = useCallback(
    (address: string) => {
      onSelect(address);
    },
    [onSelect],
  );

  if (isLoading) {
    return (
      <>
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="h-[60px] rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 animate-pulse"
          />
        ))}
      </>
    );
  }

  return (
    <>
      {tokens.slice(0, limit).map((token) => (
        <TokenSelectorRow
          key={token.address}
          token={token}
          selected={selectedAddress === token.address}
          query={balancesByAddress.get(token.address)}
          isConnected={isConnected}
          onSelect={handleSelect}
        />
      ))}
    </>
  );
}
