import { Text, View } from 'react-native';

import { IndicatorLineChart } from '@/components/charts/IndicatorLineChart';
import { AllocationBar } from '@/components/charts/AllocationBar';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type {
  EvidenceChart,
  StrategyDecisionPacket,
} from '@/integration/useStrategyDecisionPacket';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

interface DecisionPacketCardProps {
  packet: StrategyDecisionPacket | null;
  chart: EvidenceChart | null;
  loading: boolean;
}

export function DecisionPacketCard({
  packet,
  chart,
  loading,
}: DecisionPacketCardProps) {
  const { t } = useContentLanguage();
  if (loading && !packet) {
    return (
      <Card className="mx-5 mt-4 p-4">
        <SkeletonBlock className="h-5 w-40 rounded-lg" />
        <SkeletonBlock className="mt-4 h-24 w-full rounded-xl" />
      </Card>
    );
  }
  if (!packet) return null;
  const statusLabel =
    packet.status === 'action_required'
      ? 'Action required'
      : packet.status === 'blocked'
        ? 'Blocked'
        : 'No action';
  const quota = packet.guards.quota;
  const cooldown = packet.guards.cooldown;
  return (
    <Card className="mx-5 mt-4 p-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-sans-semibold text-[15px] text-ink">
          {t('strategy.todaysDecision')}
        </Text>
        <Pill className="border border-line bg-[rgba(255,255,255,.05)]">
          {statusLabel}
        </Pill>
      </View>
      <Text className="mt-1 font-mono text-[9px] text-ink-faint">
        {packet.asOf}
      </Text>

      {packet.actions.length > 0 ? (
        <Section title={t('strategy.action').toUpperCase()}>
          {packet.actions.map((action, index) => (
            <Row
              key={`${action.description}-${index}`}
              label={action.description}
              value={`$${Math.round(action.amount_usd).toLocaleString('en-US')}`}
            />
          ))}
        </Section>
      ) : (
        <Text className="mt-3 text-[12px] leading-[18px] text-ink-dim">
          {packet.statusPanel.bodyDescription}
        </Text>
      )}

      {packet.status === 'action_required' ? (
        <Section title="TARGET">
          <AllocationRows
            label={t('strategy.before')}
            rows={packet.allocation.before}
          />
          <AllocationRows
            label={t('strategy.after')}
            rows={packet.allocation.after}
          />
        </Section>
      ) : null}

      <Section title={t('strategy.trigger').toUpperCase()}>
        <Text className="text-[12px] text-ink-dim">
          {packet.trigger.ruleLabel}
        </Text>
        {packet.trigger.metrics.map((metric) => (
          <Row key={metric.label} label={metric.label} value={metric.value} />
        ))}
        {chart ? (
          <View className="mt-3">
            <IndicatorLineChart
              series={chart.values}
              overlay={chart.dma}
              gradientId="strategyDecisionEvidence"
            />
            <Row
              label="Latest / 200-DMA"
              value={`${formatNumber(chart.latestValue)} / ${formatNumber(chart.latestDma)}`}
            />
          </View>
        ) : null}
      </Section>

      <Section title={t('strategy.checks').toUpperCase()}>
        <Row label="FGI" value={packet.fearGreed?.toString() ?? '—'} />
        <Row label="Regime" value={packet.regime} />
        <Row
          label="Cooldown"
          value={
            cooldown === 'unavailable'
              ? 'Data unavailable'
              : cooldown.active
                ? `Active${cooldown.remainingDays == null ? '' : ` · ${cooldown.remainingDays}d`}`
                : 'None'
          }
        />
        <Row
          label="Quota"
          value={
            quota === 'unavailable'
              ? t('strategy.quotaUnavailable')
              : `${quota.trades7d ?? '—'}/${quota.maxTrades7d ?? '—'} trades (7d)${quota.nextTradeDate ? ` · next ${quota.nextTradeDate}` : ''}`
          }
        />
      </Section>
    </Card>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-4 border-t border-line pt-3">
      <Text className="mb-2 font-mono text-[9px] tracking-[0.9px] text-[#9a8f78]">
        {title}
      </Text>
      {children}
    </View>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="mt-1 flex-row items-start justify-between gap-3">
      <Text className="flex-1 text-[12px] text-ink-dim">{label}</Text>
      <Text className="font-mono text-[11px] text-ink">{value}</Text>
    </View>
  );
}
function AllocationRows({
  label,
  rows,
}: {
  label: string;
  rows: { label: string; value: number }[];
}) {
  const colors: Readonly<Record<string, string>> = {
    BTC: '#f7931a',
    ETH: '#7c83ff',
    SPY: '#7ad88f',
    STABLE: '#d4c5a3',
  };
  return (
    <View className="mb-2">
      <Row
        label={label}
        value={
          rows.length
            ? rows
                .map((row) => `${row.label} ${row.value.toFixed(1)}%`)
                .join(' · ')
            : 'Data unavailable'
        }
      />
      {rows.length ? (
        <AllocationBar
          className="mt-2"
          height={6}
          segments={rows.map((row) => ({
            color: colors[row.label] ?? '#9a8f78',
            value: row.value,
          }))}
        />
      ) : null}
    </View>
  );
}
function formatNumber(value: number | null): string {
  return value == null
    ? '—'
    : value.toLocaleString('en-US', { maximumFractionDigits: 5 });
}
