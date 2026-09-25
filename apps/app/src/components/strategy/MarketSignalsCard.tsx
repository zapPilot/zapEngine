import { tokens } from '@zapengine/design-tokens/tokens';
import { type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';

import { IndicatorLineChart } from '@/components/charts/IndicatorLineChart';
import { Card } from '@/components/ui/Card';
import { Disclosure } from '@/components/ui/Disclosure';
import { Pill } from '@/components/ui/Pill';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { TranslationKey } from '@/i18n/translations';
import {
  SIGNAL_RANGES,
  signalWindowStart,
  type MarketSignals,
  type SentimentSignal,
  type SentimentSignalId,
  type SignalRange,
  type SignalRegime,
  type TrendSignal,
  type TrendSignalId,
} from '@/integration/marketSignalsModel';
import { formatSignedPct, formatUsd } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

type Translate = ReturnType<typeof useContentLanguage>['t'];

const SIGNAL_NAMES: Readonly<
  Record<TrendSignalId | SentimentSignalId, string>
> = {
  btc: 'BTC',
  eth: 'ETH',
  spy: 'S&P 500',
  eth_btc: 'ETH/BTC',
  fgi: 'Crypto F&G',
  macro_fear_greed: 'Macro F&G',
};

const REGIME_KEYS: Readonly<Record<SignalRegime, TranslationKey>> = {
  extreme_fear: 'strategy.regime.extremeFear',
  fear: 'strategy.regime.fear',
  neutral: 'strategy.regime.neutral',
  greed: 'strategy.regime.greed',
  extreme_greed: 'strategy.regime.extremeGreed',
};

const REGIME_COLORS: Readonly<Record<SignalRegime, string>> = {
  extreme_fear: tokens.color.error,
  fear: tokens.color.error,
  neutral: tokens.color['ink-dim'],
  greed: tokens.color.success,
  extreme_greed: tokens.color.success,
};

const GAUGE_DOMAIN = [0, 100] as const;
const GAUGE_GUIDES = [50] as const;

interface MarketSignalsCardProps {
  signals: MarketSignals | null;
  loading: boolean;
  /** Series behind today's triggered rule: tagged, and open until toggled. */
  highlightedSignalId: TrendSignalId | null;
}

export function MarketSignalsCard({
  signals,
  loading,
  highlightedSignalId,
}: MarketSignalsCardProps) {
  const { t } = useContentLanguage();
  const [range, setRange] = useState<SignalRange>('1Y');

  if (loading && !signals) {
    return (
      <Card className="mx-5 mt-4 p-4">
        <SkeletonBlock className="h-5 w-24 rounded-lg" />
        <SkeletonBlock className="mt-4 h-40 w-full rounded-xl" />
      </Card>
    );
  }

  return (
    <Card className="mx-5 mt-4 p-4">
      <Text className="font-sans-semibold text-[15px] text-ink">
        {t('strategy.signals.title')}
      </Text>
      <Text className="mt-1 text-[11.5px] text-ink-faint">
        {t('strategy.signals.subtitle')}
      </Text>
      {signals ? (
        <>
          <Text className="mt-1 font-mono text-[9px] text-ink-faint">
            {t('strategy.signals.asOf', { date: signals.asOf })}
          </Text>
          <SectionLabel className="mb-1 mt-4">
            {t('strategy.signals.trend')}
          </SectionLabel>
          {signals.trends.map((signal) => (
            <TrendSignalRow
              key={signal.id}
              signal={signal}
              range={range}
              onRangeChange={setRange}
              highlighted={signal.id === highlightedSignalId}
            />
          ))}
          <SectionLabel className="mb-1 mt-4">
            {t('strategy.signals.sentiment')}
          </SectionLabel>
          {signals.sentiments.map((signal) => (
            <SentimentSignalRow
              key={signal.id}
              signal={signal}
              range={range}
              onRangeChange={setRange}
            />
          ))}
          <Text className="mt-2 text-[11px] leading-[16px] text-ink-faint">
            {t('strategy.signals.sentimentNote')}
          </Text>
        </>
      ) : (
        <Text className="mt-3 text-[12px] leading-[18px] text-ink-dim">
          {t('strategy.signals.unavailable')}
        </Text>
      )}
    </Card>
  );
}

interface RangeProps {
  range: SignalRange;
  onRangeChange: (range: SignalRange) => void;
}

function TrendSignalRow({
  signal,
  highlighted,
  ...rangeProps
}: RangeProps & { signal: TrendSignal; highlighted: boolean }) {
  const { t } = useContentLanguage();
  const name = SIGNAL_NAMES[signal.id];
  return (
    <SignalRow
      name={name}
      defaultExpanded={highlighted}
      tag={
        highlighted ? (
          <Pill className="bg-accent-soft px-2 py-0.5">
            <Text className="font-mono text-[9px] text-accent">
              {t('strategy.signals.triggered')}
            </Text>
          </Pill>
        ) : null
      }
      value={formatSignalValue(signal.id, signal.latest)}
      badge={
        signal.distance === null ? null : (
          <Text
            className="font-mono text-[11px]"
            style={{
              color:
                signal.distance >= 0
                  ? tokens.color.success
                  : tokens.color.error,
            }}
          >
            {formatSignedPct(signal.distance * 100)}
          </Text>
        )
      }
      subtitle={trendSubtitle(t, signal)}
    >
      <SignalChart
        id={signal.id}
        dates={signal.dates}
        values={signal.values}
        overlay={signal.dmaValues}
        {...rangeProps}
      />
    </SignalRow>
  );
}

function SentimentSignalRow({
  signal,
  ...rangeProps
}: RangeProps & { signal: SentimentSignal }) {
  const { t } = useContentLanguage();
  return (
    <SignalRow
      name={SIGNAL_NAMES[signal.id]}
      defaultExpanded={false}
      tag={null}
      value={Math.round(signal.latest).toString()}
      badge={
        signal.regime ? (
          <Text
            className="font-mono text-[11px]"
            style={{ color: REGIME_COLORS[signal.regime] }}
          >
            {t(REGIME_KEYS[signal.regime])}
          </Text>
        ) : null
      }
      subtitle={sentimentSubtitle(t, signal)}
    >
      <SignalChart
        id={signal.id}
        dates={signal.dates}
        values={signal.values}
        overlay={[]}
        gauge
        {...rangeProps}
      />
    </SignalRow>
  );
}

function SignalRow({
  name,
  defaultExpanded,
  tag,
  value,
  badge,
  subtitle,
  children,
}: {
  name: string;
  defaultExpanded: boolean;
  tag: ReactNode;
  value: string;
  badge: ReactNode;
  subtitle: string;
  children: ReactNode;
}) {
  const { t } = useContentLanguage();
  // Follows defaultExpanded (the trigger can resolve after the signals) until
  // the reader toggles the row themselves.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const expanded = toggled ?? defaultExpanded;
  return (
    <View className="border-t border-line">
      <Disclosure
        expanded={expanded}
        onToggle={() => setToggled(!expanded)}
        accessibilityLabel={t('strategy.signals.chartLabel', { name })}
        className="flex-row items-center gap-3 py-2.5"
        chevronSize={15}
        header={
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 shrink flex-row items-center gap-2">
                <Text className="font-sans-semibold text-[13px] text-ink">
                  {name}
                </Text>
                {tag}
              </View>
              <View className="flex-row items-center gap-2">
                <Text className="font-mono text-[12.5px] text-ink">
                  {value}
                </Text>
                {badge}
              </View>
            </View>
            <Text className="mt-0.5 font-mono text-[10px] text-ink-faint">
              {subtitle}
            </Text>
          </View>
        }
      >
        {children}
      </Disclosure>
    </View>
  );
}

function SignalChart({
  id,
  dates,
  values,
  overlay,
  gauge = false,
  range,
  onRangeChange,
}: RangeProps & {
  id: TrendSignalId | SentimentSignalId;
  dates: string[];
  values: number[];
  overlay: (number | null)[];
  gauge?: boolean;
}) {
  const { t } = useContentLanguage();
  const start = signalWindowStart(dates, range);
  return (
    <View className="pb-3">
      <RangeTabs
        className="mb-2 self-end"
        options={SIGNAL_RANGES}
        value={range}
        onChange={onRangeChange}
        accessibilityLabel={t('strategy.signals.rangeLabel')}
      />
      <IndicatorLineChart
        series={values.slice(start)}
        overlay={overlay.slice(start)}
        height={110}
        gradientId={`strategySignal-${id}`}
        {...(gauge ? { domain: GAUGE_DOMAIN, guides: GAUGE_GUIDES } : {})}
      />
      <View className="mt-1 flex-row justify-between">
        <Text className="font-mono text-[9px] text-ink-faint">
          {dates[start]}
        </Text>
        <Text className="font-mono text-[9px] text-ink-faint">
          {dates.at(-1)}
        </Text>
      </View>
    </View>
  );
}

function formatSignalValue(id: TrendSignalId, value: number): string {
  if (id === 'eth_btc') return value.toFixed(5);
  return formatUsd(value, value >= 1_000 ? 0 : 2);
}

function trendSubtitle(t: Translate, signal: TrendSignal): string {
  const dma =
    signal.dma === null
      ? '200DMA —'
      : `200DMA ${formatSignalValue(signal.id, signal.dma)}`;
  if (signal.isAbove === null) return dma;
  const side = signal.isAbove
    ? signal.sideSince
      ? t('strategy.signals.aboveSince', { date: signal.sideSince })
      : t('strategy.signals.aboveAllYear')
    : signal.sideSince
      ? t('strategy.signals.belowSince', { date: signal.sideSince })
      : t('strategy.signals.belowAllYear');
  return `${dma} · ${side}`;
}

function sentimentSubtitle(t: Translate, signal: SentimentSignal): string {
  if (!signal.regime) return signal.latestDate;
  const since = signal.regimeSince
    ? t('strategy.signals.since', { date: signal.regimeSince })
    : t('strategy.signals.allYear');
  if (!signal.previousRegime) return since;
  const previous = t('strategy.signals.previous', {
    regime: t(REGIME_KEYS[signal.previousRegime]),
  });
  return `${since} · ${previous}`;
}
