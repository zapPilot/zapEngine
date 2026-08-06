import { Text, View } from 'react-native';

import { TokenSelectorPill } from '@/components/invest/TokenSelectorPill';
import type { DesktopDepositToken } from '@/integration/depositTokens';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
import { formatTokenBalance, formatUsd } from '@/lib/format';

interface FundingSourceCardProps {
  chainLabel: string;
  allocation: string;
  protocol: string;
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
  chainLabel,
  allocation,
  protocol,
  token,
  tokenAmount,
  hasAmount,
  allocatedUsd,
  balance,
  balanceState,
  onSelectToken,
}: FundingSourceCardProps) {
  return (
    <View className="rounded-[22px] border border-line bg-[#111113] p-4">
      <View className="flex-row items-center gap-2">
        <Text className="font-sans-semibold text-[12px] text-ink">
          {chainLabel}
        </Text>
        <View className="rounded-full bg-accent-soft px-2 py-0.5">
          <Text className="font-mono text-[8.5px] text-accent">
            {allocation}
          </Text>
        </View>
        <Text
          className="min-w-0 flex-1 text-right text-[11px] text-ink-dim"
          numberOfLines={1}
        >
          {protocol}
        </Text>
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
          glyph={token.glyph}
          iconBg={token.iconBg}
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
