import { CHAIN_BRAND, type ChainBrandKey } from '@zapengine/brand-assets';
import { Text, View } from 'react-native';

import { TokenSelectorPill } from '@/components/invest/TokenSelectorPill';
import { ChainMark } from '@/components/token/ChainMark';
import { ProtocolIcon } from '@/components/token/ProtocolIcon';
import type { DesktopDepositToken } from '@/integration/depositTokens';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
import { formatTokenBalance, formatUsd } from '@/lib/format';

export interface FundingSourceCardProps {
  chainKey: ChainBrandKey;
  allocation: string;
  /** Protocol id behind the venue mark, e.g. `morpho`. */
  protocol: string;
  /** What inside the protocol the money lands in, e.g. `Moonwell USDC`. */
  venue: string;
  token: DesktopDepositToken;
  tokenAmount: number | null;
  hasAmount: boolean;
  allocatedUsd: number;
  balance: ChainTokenBalanceRow | null;
  balanceState: 'loading' | 'unavailable' | 'loaded';
  onSelectToken: (() => void) | undefined;
}

function formattedTokenAmount(
  value: number | null,
  token: DesktopDepositToken,
  hasAmount: boolean,
): string {
  if (!hasAmount) return '0';
  if (value === null) return '—';
  return value.toLocaleString('en-US', {
    maximumFractionDigits: token.symbol === 'ETH' ? 6 : 2,
  });
}

export function FundingSourceCard({
  chainKey,
  allocation,
  protocol,
  venue,
  token,
  tokenAmount,
  hasAmount,
  allocatedUsd,
  balance,
  balanceState,
  onSelectToken,
}: FundingSourceCardProps) {
  const chainLabel = CHAIN_BRAND[chainKey].label;

  return (
    <View className="rounded-[22px] border border-line bg-[#111113] p-4">
      <View className="flex-row items-center gap-2">
        <ChainMark chainKey={chainKey} size={16} />
        <Text className="font-sans-semibold text-[12px] text-ink">
          {chainLabel}
        </Text>
        <View className="rounded-full bg-accent-soft px-2 py-0.5">
          <Text className="font-mono text-[8.5px] text-accent">
            {allocation}
          </Text>
        </View>
        {/* The mark carries the protocol; the text keeps the market that a
            mark alone cannot disambiguate. */}
        <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1.5">
          <ProtocolIcon protocol={protocol} size={20} labelled />
          <Text
            className="min-w-0 shrink text-[11px] text-ink-dim"
            numberOfLines={1}
          >
            {venue}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-between gap-3">
        <Text
          className="min-w-0 flex-1 font-sans-semibold text-[28px] leading-[32px] text-ink"
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formattedTokenAmount(tokenAmount, token, hasAmount)}
        </Text>
        <TokenSelectorPill
          symbol={token.symbol}
          chainKey={chainKey}
          accessibilityLabel={
            onSelectToken
              ? `Select ${chainLabel} funding token`
              : `${chainLabel} funding token ${token.symbol}`
          }
          onPress={onSelectToken}
        />
      </View>

      <View className="mt-2 flex-row items-center justify-between">
        <Text className="font-mono text-[10px] text-ink-dim">
          ≈ {formatUsd(allocatedUsd)}
        </Text>
        <Text className="font-mono text-[10px] text-ink-dim">
          Balance:{' '}
          {formatTokenBalance(balance?.balance, token.symbol, balanceState)}
        </Text>
      </View>
    </View>
  );
}
