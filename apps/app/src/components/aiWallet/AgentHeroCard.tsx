import { tokens } from '@zapengine/design-tokens/tokens';
import {
  Bot,
  CalendarClock,
  CircleDollarSign,
  Lock,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { Text, View } from 'react-native';
import { formatUnits } from 'viem';

import { StatusBadge } from '@/components/aiWallet/AiWalletPrimitives';
import { Card } from '@/components/ui/Card';
import { GlowCircle } from '@/components/ui/GlowCircle';
import { Pill } from '@/components/ui/Pill';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { GUARDRAILS, USDC_DECIMALS } from '@/config/aiWalletDemo';
import type { AgentPosition } from '@/integration/agentActivity';
import { truncateAddress } from '@/lib/format';

const GUARDRAIL_ICONS: readonly LucideIcon[] = [
  CircleDollarSign,
  Lock,
  ShieldCheck,
  CalendarClock,
];

const BASE_BLUE = '#0052ff';

interface AgentHeroCardProps {
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

export function AgentHeroCard({
  agentAddress,
  configured,
  position,
  loading,
  failed,
}: AgentHeroCardProps) {
  return (
    <Card
      className="p-5"
      style={{
        backgroundColor: 'rgba(212,197,163,.035)',
        borderColor: 'rgba(212,197,163,.22)',
      }}
    >
      <GlowCircle
        size={300}
        color={tokens.color.accent}
        opacity={0.18}
        className="right-[-96px] top-[-112px]"
      />
      <GlowCircle
        size={220}
        color={BASE_BLUE}
        opacity={0.12}
        className="bottom-[-96px] left-[-80px]"
      />

      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 shrink flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(212,197,163,.35)] bg-[#141416]">
            <Bot size={20} color={tokens.color.accent} strokeWidth={1.8} />
          </View>
          <View className="min-w-0 shrink">
            <SectionLabel className="text-[#9a8f78]">Zap Agent</SectionLabel>
            <Text
              className="mt-1 font-mono-medium text-[13px] text-ink"
              numberOfLines={1}
            >
              {configured ? truncateAddress(agentAddress) : 'Deploying soon'}
            </Text>
          </View>
        </View>
        <Pill className="border border-[rgba(0,82,255,.5)] bg-[rgba(0,82,255,.14)]">
          <View
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: BASE_BLUE }}
          />
          <Text className="font-sans-semibold text-[11px] text-ink">Base</Text>
        </Pill>
      </View>

      <View className="mt-6 flex-row flex-wrap items-center gap-2">
        <SectionLabel>Position</SectionLabel>
        {configured && position ? (
          <StatusBadge tone="live">Live</StatusBadge>
        ) : null}
      </View>
      <View className="mt-3 flex-row gap-3">
        <PositionStat
          label="In Spark USDC vault"
          value={position ? formatUsdcBalance(position.depositedUsdc) : null}
          loading={configured && loading}
          highlight
        />
        <PositionStat
          label="Idle in wallet"
          value={position ? formatUsdcBalance(position.idleUsdc) : null}
          loading={configured && loading}
        />
      </View>
      <Text className="mt-2.5 text-[11px] leading-4 text-ink-faint">
        {!configured
          ? 'Balances appear once the agent wallet is deployed.'
          : failed && !position
            ? 'Base RPC is unreachable right now. Retrying.'
            : 'Read from Base: vault shares converted to USDC, plus idle USDC.'}
      </Text>

      <View className="mt-5 border-t border-line pt-4">
        <SectionLabel>Guardrails</SectionLabel>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {GUARDRAILS.map((guardrail, index) => {
            const Icon = GUARDRAIL_ICONS[index] ?? ShieldCheck;
            return (
              <Pill
                key={guardrail}
                className="border border-[rgba(212,197,163,.22)] bg-[rgba(212,197,163,.06)] px-3 py-1.5"
              >
                <Icon size={13} color={tokens.color.accent} strokeWidth={1.8} />
                <Text className="font-sans-medium text-[12px] text-ink">
                  {guardrail}
                </Text>
              </Pill>
            );
          })}
        </View>
      </View>
    </Card>
  );
}

function PositionStat({
  label,
  value,
  loading,
  highlight = false,
}: {
  label: string;
  value: string | null;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <View
      className="min-w-0 flex-1 rounded-2xl border px-4 py-3.5"
      style={{
        borderColor: highlight ? 'rgba(212,197,163,.28)' : tokens.color.line,
        backgroundColor: highlight
          ? 'rgba(212,197,163,.07)'
          : 'rgba(255,255,255,.02)',
      }}
    >
      <Text className="text-[11px] text-ink-dim" numberOfLines={1}>
        {label}
      </Text>
      {loading && value === null ? (
        <SkeletonBlock className="mt-2 h-8 w-24 rounded-lg" />
      ) : (
        <View className="mt-1.5 flex-row items-baseline gap-1.5">
          <Text
            className="font-serif text-[34px] leading-[38px]"
            style={{
              color: highlight ? tokens.color.accent : tokens.color.ink,
            }}
            numberOfLines={1}
          >
            {value ?? '—'}
          </Text>
          <Text className="font-mono text-[10.5px] text-ink-dim">USDC</Text>
        </View>
      )}
    </View>
  );
}
