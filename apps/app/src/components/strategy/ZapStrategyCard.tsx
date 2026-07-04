import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { AllocationBar } from '@/components/charts/AllocationBar';
import type { Metric } from '@/components/metrics/MetricsGrid';
import { ArrowGlyph } from '@/components/ui/ArrowGlyph';
import { Card } from '@/components/ui/Card';
import { GlowCircle } from '@/components/ui/GlowCircle';
import { Pill } from '@/components/ui/Pill';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ZapLogo } from '@/components/ui/ZapLogo';

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
}

export function ZapStrategyCard({ strategy, onStart }: ZapStrategyCardProps) {
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
