import type { RuleTraceEntry } from '@zapengine/app-core/services/suggestion';
import { tokens } from '@zapengine/design-tokens/tokens';
import { humanizeSlug } from '@zapengine/types/shared';
import { Text, View } from 'react-native';

import { AllocationBar } from '@/components/charts/AllocationBar';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { TranslationKey } from '@/i18n/translations';
import type { StrategyDecisionPacket } from '@/integration/useStrategyDecisionPacket';
import { cn } from '@/lib/cn';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

interface DecisionPacketCardProps {
  packet: StrategyDecisionPacket | null;
  loading: boolean;
}

// Rule names are frozen wire ids; unknown ones fall back to a humanized slug.
const RULE_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  cross_down_exit: 'strategy.rule.crossDownExit',
  cross_up_equal_weight: 'strategy.rule.crossUpEqualWeight',
  eth_btc_ratio_rotation: 'strategy.rule.ethBtcRatioRotation',
  eth_btc_deviation_dca: 'strategy.rule.ethBtcDeviationDca',
  dma_overextension_dca_sell: 'strategy.rule.dmaOverextensionDcaSell',
  fgi_downshift_dca_sell: 'strategy.rule.fgiDownshiftDcaSell',
};

type Translate = ReturnType<typeof useContentLanguage>['t'];

function ruleLabel(t: Translate, ruleName: string): string {
  const key = RULE_LABEL_KEYS[ruleName];
  return key ? t(key) : humanizeSlug(ruleName, {}, ruleName);
}

export function DecisionPacketCard({
  packet,
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
          {packet.trigger.ruleName
            ? ruleLabel(t, packet.trigger.ruleName)
            : packet.trigger.ruleLabel}
        </Text>
        {packet.trigger.metrics.map((metric) => (
          <Row key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </Section>

      {packet.ruleTrace.length > 0 ? (
        <Section title={t('strategy.why').toUpperCase()}>
          {packet.ruleTrace.map((entry) => (
            <RuleTraceRow key={entry.ruleName} entry={entry} />
          ))}
        </Section>
      ) : null}

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
const RULE_STATUS_COLORS: Readonly<Record<RuleTraceEntry['status'], string>> = {
  fired: tokens.color.accent,
  cooldown: tokens.color['ink-dim'],
  shadowed: tokens.color['ink-dim'],
  inactive: tokens.color['ink-faint'],
  not_matched: tokens.color['ink-faint'],
};

function RuleTraceRow({ entry }: { entry: RuleTraceEntry }) {
  const { t } = useContentLanguage();
  const fired = entry.status === 'fired';
  return (
    <View className="mt-1.5 flex-row items-center gap-2">
      <View
        className="h-[7px] w-[7px] rounded-full"
        style={{
          backgroundColor: fired ? RULE_STATUS_COLORS.fired : 'transparent',
          borderColor: RULE_STATUS_COLORS[entry.status],
          borderWidth: 1,
        }}
      />
      <Text
        className={cn(
          'flex-1 text-[12px]',
          fired ? 'font-sans-semibold text-ink' : 'text-ink-dim',
        )}
      >
        {ruleLabel(t, entry.ruleName)}
      </Text>
      <Text
        className="font-mono text-[10.5px]"
        style={{ color: RULE_STATUS_COLORS[entry.status] }}
      >
        {ruleStatusLabel(t, entry)}
      </Text>
    </View>
  );
}

function ruleStatusLabel(t: Translate, entry: RuleTraceEntry): string {
  switch (entry.status) {
    case 'fired':
      return t('strategy.ruleStatus.fired');
    case 'cooldown':
      return entry.cooldownRemainingDays === null
        ? t('strategy.ruleStatus.cooldown')
        : t('strategy.ruleStatus.cooldownDays', {
            days: entry.cooldownRemainingDays,
          });
    case 'shadowed':
      return t('strategy.ruleStatus.shadowed', {
        rule: ruleLabel(t, entry.suppressedBy ?? ''),
      });
    case 'inactive':
      return t('strategy.ruleStatus.inactive');
    case 'not_matched':
      return t('strategy.ruleStatus.notMatched');
  }
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
