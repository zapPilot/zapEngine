import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { formatUnits } from 'viem';

import { Tap } from '@/components/ui/Tap';
import {
  hlpRouteLabel,
  type HlpFundingSource,
} from '@/integration/investTargetsModel';
import { formatUsd } from '@/lib/format';

interface HlpAutoSourceCardProps {
  weightBps: number;
  funding: HlpFundingSource | null;
  /** True once an amount is entered, so "no source" is a real failure. */
  hasAmount: boolean;
}

/**
 * HLP picks its own funding source, so this card reports the resolved route
 * rather than offering a token selector. The link out covers the other way in:
 * USDC already sitting on Hyperliquid.
 */
export function HlpAutoSourceCard({
  weightBps,
  funding,
  hasAmount,
}: HlpAutoSourceCardProps) {
  const router = useRouter();

  return (
    <View className="rounded-[18px] border border-line bg-[#111113] p-4">
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1 pr-3">
          <Text className="font-sans-semibold text-[12px] text-ink">
            HLP · {weightBps / 100}%
          </Text>
          <Text className="mt-1 text-[10.5px] text-ink-dim">
            One wallet source funds the whole HLP allocation
          </Text>
        </View>
        <Text className="font-mono text-[10px] uppercase text-accent">
          Auto
        </Text>
      </View>
      <View className="mt-3 border-t border-line pt-3">
        <Text className="text-[10.5px] text-ink-dim">Funding route</Text>
        <Text className="mt-1 font-sans-semibold text-[11.5px] text-ink">
          {funding
            ? hlpRouteLabel(funding.token, funding.ingress)
            : hasAmount
              ? 'No single source can cover this allocation'
              : 'Resolved after you enter an amount'}
        </Text>
        {funding ? (
          <Text className="mt-1 font-mono text-[10.5px] text-ink-dim">
            {formatUsd(Number(formatUnits(funding.availableUsd6, 6)))} available
            after the other destinations are reserved
          </Text>
        ) : null}
      </View>
      <Tap
        accessibilityRole="link"
        accessibilityLabel="Deposit from your Hyperliquid balance instead"
        className="mt-3 self-start"
        onPress={() => router.push('/invest/hlp-deposit')}
      >
        <Text className="text-[11px] text-accent underline">
          Deposit from your Hyperliquid balance instead
        </Text>
      </Tap>
    </View>
  );
}
