import { palette } from '@/lib/palette';
import type { RuleTraceEntry } from '@zapengine/app-core/services/suggestion';
import { tokens } from '@zapengine/design-tokens/tokens';
import { humanizeSlug } from '@zapengine/types/shared';
import { Text, View } from 'react-native';

import { AllocationBar } from '@/components/charts/AllocationBar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { TranslationKey } from '@/i18n/translations';
import type { StrategyDecisionPacket } from '@/integration/useStrategyDecisionPacket';
import { cn } from '@/lib/cn';
import { assetColor } from '@/lib/assetColors';
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
      <Card className="mt-4 p-4">
        <SkeletonBlock className="h-5 w-40 rounded-panel" />
        <SkeletonBlock className="mt-4 h-24 w-full rounded-panel" />
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
    <Card className="mt-4 p-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-text-semibold text-body text-ink">
          {t('strategy.todaysDecision')}
        </Text>
        <Badge className="border border-rule bg-well">{statusLabel}</Badge>
      </View>
      <Text className="mt-1 font-mono text-data text-ink-3">{packet.asOf}</Text>

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
        <Text className="font-text mt-3 text-caption leading-[18px] text-ink-2">
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
        <Text className="font-text text-caption text-ink-2">
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
    <View className="mt-4 border-t border-rule pt-3">
      <Text className="mb-2 font-mono text-data tracking-[0.9px] text-ink-3">
        {title}
      </Text>
      {children}
    </View>
  );
}
const RULE_STATUS_COLORS: Readonly<Record<RuleTraceEntry['status'], string>> = {
  fired: tokens.mode.night['ink'],
  cooldown: tokens.mode.night['ink-2'],
  shadowed: tokens.mode.night['ink-2'],
  inactive: tokens.mode.night['ink-3'],
  not_matched: tokens.mode.night['ink-3'],
};

function RuleTraceRow({ entry }: { entry: RuleTraceEntry }) {
  const { t } = useContentLanguage();
  const fired = entry.status === 'fired';
  return (
    <View className="mt-1.5 flex-row items-center gap-2">
      <View
        className="h-[7px] w-[7px] rounded-round"
        style={{
          backgroundColor: fired ? RULE_STATUS_COLORS.fired : 'transparent',
          borderColor: RULE_STATUS_COLORS[entry.status],
          borderWidth: 1,
        }}
      />
      <Text
        className={cn(
          'flex-1 text-caption',
          fired ? 'font-text-semibold text-ink' : 'text-ink-2',
        )}
      >
        {ruleLabel(t, entry.ruleName)}
      </Text>
      <Text
        className="font-mono text-data"
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
      <Text className="font-text flex-1 text-caption text-ink-2">{label}</Text>
      <Text className="font-mono text-data text-ink">{value}</Text>
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
    BTC: assetColor('btc'),
    ETH: assetColor('eth'),
    SPY: assetColor('spy'),
    STABLE: assetColor('stable'),
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
            color: colors[row.label] ?? palette['ink-2'],
            value: row.value,
          }))}
        />
      ) : null}
    </View>
  );
}
