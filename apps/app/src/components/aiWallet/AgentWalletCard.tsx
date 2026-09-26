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
import { USDC_DECIMALS, WETH_DECIMALS } from '@/config/aiWalletDemo';
import type { AgentPosition } from '@/integration/agentActivity';
import { truncateAddress } from '@/lib/format';

interface AgentWalletCardProps {
  agentAddress: string;
  configured: boolean;
  position: AgentPosition | undefined;
  loading: boolean;
  failed: boolean;
}

interface AssetUnit {
  symbol: string;
  decimals: number;
  fractionDigits: number;
}

const USDC_UNIT: AssetUnit = {
  symbol: 'USDC',
  decimals: USDC_DECIMALS,
  fractionDigits: 2,
};
// The position is held as WETH on-chain, but the wallet presents it as ETH.
const ETH_DISPLAY_UNIT: AssetUnit = {
  symbol: 'ETH',
  decimals: WETH_DECIMALS,
  fractionDigits: 6,
};

function formatBalance(amount: bigint, unit: AssetUnit): string {
  return Number(formatUnits(amount, unit.decimals)).toLocaleString('en-US', {
    minimumFractionDigits: unit.fractionDigits,
    maximumFractionDigits: unit.fractionDigits,
  });
}

export function AgentWalletCard({
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
    <Card style={{ borderColor: 'rgba(91,147,255,.22)' }}>
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
          <PositionRow
            icon={<TokenIcon symbol="USDC" size={26} />}
            label="USDC"
            metadata="Wallet"
            amount={position?.idleUsdc}
            unit={USDC_UNIT}
            loading={balancesLoading}
          />

          <View className="mt-1 border-t border-line pt-4">
            <View className="flex-row items-center gap-3 pb-1">
              <ProtocolIcon protocol="morpho" size={40} />
              <Text className="font-sans-semibold text-[16px] text-ink">
                Morpho
              </Text>
            </View>

            <PositionRow
              icon={<TokenIcon symbol="ETH" size={26} />}
              label="ETH"
              metadata="Clearstar"
              amount={position?.ethVaultWeth}
              unit={ETH_DISPLAY_UNIT}
              loading={balancesLoading}
            />
            <PositionRow
              icon={<TokenIcon symbol="USDC" size={26} />}
              label="USDC"
              metadata="Spark"
              amount={position?.depositedUsdc}
              unit={USDC_UNIT}
              loading={balancesLoading}
            />
          </View>
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

function PositionRow({
  icon,
  label,
  metadata,
  amount,
  unit,
  loading,
}: {
  icon: ReactNode;
  label: string;
  metadata: string;
  amount: bigint | undefined;
  unit: AssetUnit;
  loading: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      {icon}
      <View className="min-w-0 flex-1">
        <Text
          className="font-sans-medium text-[15px] leading-5 text-ink"
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          className="text-[10px] leading-[14px] text-ink-faint"
          numberOfLines={1}
        >
          {metadata}
        </Text>
      </View>
      {loading ? (
        <SkeletonBlock className="h-7 w-24 rounded-lg" />
      ) : (
        <View className="flex-row items-baseline gap-1.5">
          <Text className="font-sans-semibold text-[24px] leading-[30px] text-ink">
            {amount === undefined ? '—' : formatBalance(amount, unit)}
          </Text>
          <Text className="font-mono text-[11px] text-ink-dim">
            {unit.symbol}
          </Text>
        </View>
      )}
    </View>
  );
}
