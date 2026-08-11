import { useState } from 'react';

import { ChainTokenSelectorSheet } from '@/components/invest/ChainTokenSelectorSheet';
import {
  FundingSourceCard,
  type FundingSourceCardProps,
} from '@/components/invest/FundingSourceCard';
import type { DesktopDepositToken } from '@/integration/depositTokens';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';

interface FundingSourceSelectorProps
  extends Omit<FundingSourceCardProps, 'onSelectToken'> {
  tokens: readonly DesktopDepositToken[];
  rows: readonly ChainTokenBalanceRow[];
  onSelectToken: (token: DesktopDepositToken) => void;
}

/**
 * Shared funding-token selector used by Both, Base-only, and Arbitrum-only
 * deposit scopes. Keeping the card and sheet together prevents a scope from
 * accidentally rendering a non-interactive funding token.
 */
export function FundingSourceSelector({
  chainLabel,
  allocation,
  protocol,
  tokens,
  token,
  tokenAmount,
  hasAmount,
  allocatedUsd,
  balance,
  balanceState,
  rows,
  onSelectToken,
}: FundingSourceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <FundingSourceCard
        chainLabel={chainLabel}
        allocation={allocation}
        protocol={protocol}
        token={token}
        tokenAmount={tokenAmount}
        hasAmount={hasAmount}
        allocatedUsd={allocatedUsd}
        balance={balance}
        balanceState={balanceState}
        onSelectToken={() => setIsOpen(true)}
      />
      <ChainTokenSelectorSheet
        visible={isOpen}
        chainLabel={chainLabel}
        tokens={tokens}
        rows={rows}
        balanceState={balanceState}
        selected={token}
        onSelect={onSelectToken}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
