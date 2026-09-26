import { useToast } from '@zapengine/app-core/providers/ToastContext';
import { tokens } from '@zapengine/design-tokens/tokens';
import * as Clipboard from 'expo-clipboard';
import { Copy } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { formatUnits } from 'viem';

import {
  PLANET_CONTENT_OFFSET,
  PlanetHorizon,
} from '@/components/aiWallet/PlanetHorizon';
import { ProtocolIcon } from '@/components/token/ProtocolIcon';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Card } from '@/components/ui/Card';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import { USDC_DECIMALS } from '@/config/aiWalletDemo';
import type { AgentPosition } from '@/integration/agentActivity';
import { truncateAddress } from '@/lib/format';

interface AgentWalletCardProps {
  /** Grow to the height of the row it sits in (wide layout). */
  fill: boolean;
  agentAddress: string;
  configured: boolean;
  position: AgentPosition | undefined;
  loading: boolean;
  failed: boolean;
}

function formatUsdcBalance(amount: bigint): string {
  return Number(formatUnits(amount, USDC_DECIMALS)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AgentWalletCard({
  fill,
  agentAddress,
  configured,
  position,
  loading,
  failed,
}: AgentWalletCardProps) {
  const { showToast } = useToast();
  const balancesLoading = configured && loading && position === undefined;
  const note = !configured
    ? 'Balances appear once the agent wallet is deployed.'
    : failed && position === undefined
      ? 'Base RPC is unreachable right now. Retrying.'
      : null;

  const copyAddress = () => {
    void Clipboard.setStringAsync(agentAddress).then(() =>
      showToast({ type: 'success', title: 'Address copied' }),
    );
  };

  return (
    <Card
      className={fill ? 'flex-1' : ''}
      style={{ borderColor: 'rgba(91,147,255,.22)' }}
    >
      <PlanetHorizon />
      <View className="px-6 pb-6" style={{ paddingTop: PLANET_CONTENT_OFFSET }}>
        <Text className="font-mono-medium text-[11px] uppercase tracking-[2px] text-ink-dim">
          Wallet
        </Text>
        <View className="mt-2 flex-row items-center gap-3">
          <Text
            className="min-w-0 shrink font-mono-medium text-[26px] leading-[32px] text-ink"
            numberOfLines={1}
          >
            {configured ? truncateAddress(agentAddress) : 'Deploying soon'}
          </Text>
          {configured ? (
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Copy agent wallet address"
              onPress={copyAddress}
              className="h-9 w-9 items-center justify-center rounded-full border border-line-hi bg-[rgba(10,10,10,.4)]"
            >
              <Copy size={15} color={tokens.color['ink-dim']} />
            </Tap>
          ) : null}
        </View>

        <View className="mt-5 border-t border-line pt-1">
          <AssetRow
            icon={<TokenIcon symbol="USDC" size={34} />}
            label="USDC"
            amount={position?.idleUsdc}
            loading={balancesLoading}
          />
          <AssetRow
            icon={<ProtocolIcon protocol="morpho" size={34} />}
            label="Morpho / Spark"
            amount={position?.depositedUsdc}
            loading={balancesLoading}
          />
        </View>
        {note === null ? null : (
          <Text className="mt-1 text-[11px] leading-4 text-ink-faint">
            {note}
          </Text>
        )}
      </View>
    </Card>
  );
}

function AssetRow({
  icon,
  label,
  amount,
  loading,
}: {
  icon: ReactNode;
  label: string;
  amount: bigint | undefined;
  loading: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3 py-3">
      {icon}
      <Text
        className="min-w-0 flex-1 font-sans-medium text-[15px] text-ink"
        numberOfLines={1}
      >
        {label}
      </Text>
      {loading ? (
        <SkeletonBlock className="h-7 w-24 rounded-lg" />
      ) : (
        <View className="flex-row items-baseline gap-1.5">
          <Text className="font-sans-semibold text-[24px] leading-[30px] text-ink">
            {amount === undefined ? '—' : formatUsdcBalance(amount)}
          </Text>
          <Text className="font-mono text-[11px] text-ink-dim">USDC</Text>
        </View>
      )}
    </View>
  );
}
