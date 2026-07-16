import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { AllocationBar } from '@/components/charts/AllocationBar';
import type { Metric } from '@/components/metrics/MetricsGrid';
import { ArrowGlyph } from '@/components/ui/ArrowGlyph';
import { Card } from '@/components/ui/Card';
import { GlowCircle } from '@/components/ui/GlowCircle';
import { Pill } from '@/components/ui/Pill';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import { ZapLogo } from '@/components/ui/ZapLogo';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
import type { MoralisChainKey } from '@/integration/moralisWallet';
import { formatUsd } from '@/lib/format';

export interface ZapStrategyCardData {
  estApyLabel: string;
  quote: string;
  marketModeLabel: string;
  pillars: { label: string; weight: number; color: string }[];
  backtest: {
    metrics: Metric[];
  };
}

interface ZapStrategyCardProps {
  strategy: ZapStrategyCardData;
  onStart: () => void;
  availableToInvest?: {
    totalUsdValue: number | null;
    rows: ChainTokenBalanceRow[];
    isConnected: boolean;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
    failedChains: MoralisChainKey[];
    onRetry: () => void;
  };
}

function compactBalance(row: ChainTokenBalanceRow): string {
  const amount = Number.parseFloat(row.balance);
  if (!Number.isFinite(amount)) return `0 ${row.token.symbol}`;
  return `${amount.toLocaleString('en-US', {
    maximumFractionDigits:
      row.token.symbol === 'USDC' || row.token.symbol === 'USDT' ? 2 : 5,
  })} ${row.token.symbol}`;
}

function AvailableToInvest({
  data,
}: {
  data: NonNullable<ZapStrategyCardProps['availableToInvest']>;
}) {
  if (!data.isConnected) return null;

  const isMissingAlchemyConfig =
    data.error?.message.toLowerCase().includes('alchemy') === true &&
    data.error.message.toLowerCase().includes('missing') === true;
  const isPartial = data.failedChains.length > 0;

  return (
    <View
      className="mt-4 rounded-[14px] border px-3.5 py-3"
      style={{
        borderColor: 'rgba(212,197,163,.16)',
        backgroundColor: 'rgba(7,7,8,.42)',
      }}
    >
      <View className="flex-row items-end justify-between">
        <Text className="font-mono text-[9px] uppercase tracking-[.9px] text-ink-faint">
          Wallet available
        </Text>
        {!data.isLoading && !data.isError ? (
          <Text className="font-mono-semibold text-[15px] text-ink">
            {data.totalUsdValue === null
              ? data.rows.length === 0
                ? '$0.00'
                : '—'
              : `${isPartial ? '≥ ' : ''}${formatUsd(data.totalUsdValue)}`}
          </Text>
        ) : null}
      </View>

      {data.isLoading ? (
        <View className="mt-3 gap-2">
          <SkeletonBlock className="h-7 w-full rounded-lg" />
          <SkeletonBlock className="h-7 w-full rounded-lg" />
        </View>
      ) : data.isError ? (
        <View className="mt-2.5 flex-row items-center gap-3">
          <View className="min-w-0 flex-1">
            <Text
              className="font-sans-semibold text-[12px]"
              style={{ color: '#ef9292' }}
            >
              {isMissingAlchemyConfig
                ? 'Balance service is not configured'
                : 'Wallet balance unavailable'}
            </Text>
            <Text className="mt-0.5 text-[10.5px] leading-[15px] text-ink-dim">
              {isMissingAlchemyConfig
                ? 'Restart the app after loading the Alchemy API key.'
                : 'Check your connection, then try again.'}
            </Text>
          </View>
          <Tap
            accessibilityLabel="Retry available balance"
            accessibilityRole="button"
            className="flex-row items-center gap-1 rounded-full border px-2.5 py-1.5"
            style={{
              borderColor: 'rgba(212,197,163,.22)',
              backgroundColor: 'rgba(212,197,163,.07)',
            }}
            onPress={data.onRetry}
          >
            <RefreshCw size={11} strokeWidth={2} color="#d4c5a3" />
            <Text className="font-sans-semibold text-[10px] text-accent">
              Retry
            </Text>
          </Tap>
        </View>
      ) : data.rows.length === 0 ? (
        <View className="mt-2">
          <Text className="font-sans-semibold text-[12px] text-ink-dim">
            No supported balance yet
          </Text>
          <Text className="mt-0.5 text-[10.5px] leading-[15px] text-ink-faint">
            Fund this wallet with USDC, USDT or ETH to get started.
          </Text>
        </View>
      ) : (
        <View className="mt-2 gap-1.5">
          {data.rows.slice(0, 3).map((row) => (
            <View key={row.id} className="flex-row items-center gap-2">
              <View
                className="rounded-full border px-2 py-0.5"
                style={{
                  borderColor: 'rgba(212,197,163,.18)',
                  backgroundColor: 'rgba(212,197,163,.07)',
                }}
              >
                <Text className="font-mono text-[8.5px] text-accent">
                  {row.chainLabel}
                </Text>
              </View>
              <Text className="flex-1 font-mono text-[11px] text-ink-dim">
                {compactBalance(row)}
              </Text>
              <Text className="font-mono text-[11px] text-ink-faint">
                {row.usdValue === null ? '—' : formatUsd(row.usdValue)}
              </Text>
            </View>
          ))}
        </View>
      )}
      {!data.isLoading && !data.isError && isPartial ? (
        <View className="mt-2.5 flex-row items-center gap-2 rounded-lg bg-[rgba(239,146,146,.07)] px-2.5 py-2">
          <Text className="min-w-0 flex-1 text-[10.5px] leading-[15px] text-[#ef9292]">
            Some network balances are unavailable, so this total is incomplete.
          </Text>
          <Tap
            accessibilityLabel="Retry unavailable network balances"
            accessibilityRole="button"
            className="min-h-9 justify-center px-1"
            hitSlop={8}
            onPress={data.onRetry}
          >
            <Text className="font-sans-semibold text-[10.5px] text-accent">
              Retry
            </Text>
          </Tap>
        </View>
      ) : null}
    </View>
  );
}

export function ZapStrategyCard({
  strategy,
  onStart,
  availableToInvest,
}: ZapStrategyCardProps) {
  const quote = strategy.quote.trim();
  const hasQuote = quote.length > 0 && quote !== '—';

  return (
    <Card className="p-4" style={{ borderColor: 'rgba(212,197,163,.24)' }}>
      {/* Desktop: linear-gradient(158deg, …) card fill. */}
      <LinearGradient
        colors={['rgba(212,197,163,.12)', 'rgba(20,20,22,.55)']}
        start={{ x: 0.31, y: 0.04 }}
        end={{ x: 0.69, y: 0.96 }}
        className="absolute inset-0"
      />
      <GlowCircle
        size={220}
        color="#d4c5a3"
        opacity={0.16}
        className="absolute bottom-[-60px] left-[-40px]"
      />
      <View className="relative">
        <View className="flex-row items-start justify-between">
          <View className="flex-row items-center gap-[11px]">
            <View
              className="h-10 w-10 items-center justify-center rounded-xl"
              style={{
                backgroundColor: '#0e0e10',
                borderWidth: 1,
                borderColor: 'rgba(212,197,163,.35)',
              }}
            >
              <ZapLogo size={20} />
            </View>
            <View>
              <Text className="font-serif text-[23px] leading-[23px] text-ink">
                Zap Strategy
              </Text>
              <Text
                className="mt-[5px] font-mono text-[9.5px] uppercase tracking-[0.95px]"
                style={{ color: '#9a8f78' }}
              >
                Disciplined autopilot
              </Text>
            </View>
          </View>
          <Pill
            className="gap-[5px] px-[9px] py-1"
            style={{
              backgroundColor: 'rgba(255,255,255,.05)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,.08)',
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: '#7ad88f',
              }}
            />
            <Text className="font-mono text-[9.5px] text-ink-dim">AUTO</Text>
          </Pill>
        </View>

        {hasQuote ? (
          <Text
            className="mt-[13px] font-serif text-[16px] italic"
            style={{ color: '#d4cdbc' }}
          >
            &ldquo;{quote}&rdquo;
          </Text>
        ) : null}

        <View className="mt-[14px] flex-row items-end gap-4">
          <View className="shrink-0">
            <Text className="font-serif text-[30px] leading-[30px] text-accent">
              {strategy.estApyLabel}
            </Text>
            <Text
              className="mt-[5px] font-mono text-[9px] uppercase tracking-[0.72px]"
              style={{ color: '#6f6a5f' }}
            >
              {strategy.estApyLabel === '—'
                ? 'Backtest ROI unavailable'
                : 'Default backtest ROI'}
            </Text>
          </View>
          <View className="flex-1">
            <AllocationBar
              segments={strategy.pillars.map((pillar) => ({
                color: pillar.color,
                value: pillar.weight,
              }))}
            />
            <View className="mt-1.5 flex-row justify-between">
              {strategy.pillars.map((pillar) => (
                <Text
                  key={pillar.label}
                  className="font-mono text-[8.5px] tracking-[0.17px]"
                  style={{ color: '#6f6a5f' }}
                >
                  {pillar.label}
                </Text>
              ))}
            </View>
          </View>
        </View>

        {availableToInvest ? (
          <AvailableToInvest data={availableToInvest} />
        ) : null}

        <PrimaryButton className="mt-[16px]" onPress={onStart}>
          <Text className="font-sans-semibold text-[15.5px] text-[#0a0a0a]">
            Start with Zap Strategy
          </Text>
          <ArrowGlyph />
        </PrimaryButton>
        <Text
          className="mt-2.5 text-center font-mono text-[9.5px] tracking-[0.38px]"
          style={{ color: '#6f6a5f' }}
        >
          {strategy.marketModeLabel}
        </Text>
      </View>
    </Card>
  );
}
