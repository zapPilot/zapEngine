import { tokens } from '@zapengine/design-tokens/tokens';
import { Newspaper, Play, Scale } from 'lucide-react-native';
import { Text, View } from 'react-native';

import {
  CardHeading,
  ExplorerLink,
  StatusBadge,
} from '@/components/aiWallet/AiWalletPrimitives';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import {
  BASESCAN_URL,
  DECISION_RULE_COPY,
  EXCHANGE_HACK_THRESHOLD,
  LAYA_MODEL,
  LAYA_SNAPSHOT,
} from '@/config/aiWalletDemo';
import {
  basescanTxUrl,
  formatRelativeTime,
  type AgentTransaction,
} from '@/integration/agentActivity';
import {
  AWAITING_FIRST_ACTION_DETAIL,
  formatProbability,
} from '@/integration/agentLoopModel';
import { truncateAddress } from '@/lib/format';

interface DecisionCardProps {
  headline: string;
  headlineIsLive: boolean;
  headlineLoading: boolean;
  latestDeposit: AgentTransaction | null;
  nowMs: number;
  onWatchStory: () => void;
}

const PRESSURE_ROWS = [
  { label: 'Upward', value: LAYA_SNAPSHOT.ethPressure.upward, chosen: true },
  { label: 'None', value: LAYA_SNAPSHOT.ethPressure.none, chosen: false },
  {
    label: 'Downward',
    value: LAYA_SNAPSHOT.ethPressure.downward,
    chosen: false,
  },
] as const;

function toPercent(probability: number): number {
  return probability * 100;
}

export function DecisionCard({
  headline,
  headlineIsLive,
  headlineLoading,
  latestDeposit,
  nowMs,
  onWatchStory,
}: DecisionCardProps) {
  return (
    <Card className="p-5">
      <CardHeading eyebrow="Decision" title="Why the agent moved" />

      <View className="mt-4 rounded-2xl border border-line bg-[rgba(255,255,255,.03)] p-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View className="flex-row items-center gap-2">
            <Newspaper
              size={14}
              color={tokens.color.accent}
              strokeWidth={1.8}
            />
            <SectionLabel>Fed to Chain · headline</SectionLabel>
          </View>
          {headlineLoading ? null : (
            <StatusBadge tone={headlineIsLive ? 'live' : 'snapshot'}>
              {headlineIsLive ? 'Live feed' : 'Snapshot'}
            </StatusBadge>
          )}
        </View>
        {headlineLoading ? (
          <View className="mt-3 gap-2">
            <SkeletonBlock className="h-5 w-full rounded-md" />
            <SkeletonBlock className="h-5 w-3/4 rounded-md" />
          </View>
        ) : (
          <Text className="mt-2.5 font-serif text-[22px] leading-[27px] text-ink">
            {headline}
          </Text>
        )}
      </View>

      <View className="mt-5">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View className="flex-row items-center gap-2">
            <SectionLabel>Laya&apos;s read</SectionLabel>
            <Text className="font-mono text-[10px] text-ink-faint">
              {LAYA_MODEL}
            </Text>
          </View>
          <StatusBadge tone="snapshot">Snapshot</StatusBadge>
        </View>

        <Text className="mt-3 text-[12.5px] text-ink-dim">
          Is this an exchange hack?
        </Text>
        <ProbabilityRow
          label="Yes"
          probability={LAYA_SNAPSHOT.exchangeHack.yes}
          chosen
          threshold={EXCHANGE_HACK_THRESHOLD}
        />
        <Text className="ml-[80px] mt-1 font-mono text-[9.5px] text-ink-faint">
          Marker = rule threshold (≥{' '}
          {Math.round(toPercent(EXCHANGE_HACK_THRESHOLD))}%)
        </Text>

        <Text className="mt-4 text-[12.5px] text-ink-dim">
          Which way does it push ETH?
        </Text>
        {PRESSURE_ROWS.map((row) => (
          <ProbabilityRow
            key={row.label}
            label={row.label}
            probability={row.value}
            chosen={row.chosen}
          />
        ))}
      </View>

      <View className="mt-5 flex-row gap-3 rounded-2xl border border-[rgba(212,197,163,.22)] bg-[rgba(212,197,163,.05)] p-4">
        <Scale size={16} color={tokens.color.accent} strokeWidth={1.8} />
        <View className="min-w-0 flex-1">
          <SectionLabel className="text-[#9a8f78]">Fixed rule</SectionLabel>
          <Text className="mt-1.5 text-[12.5px] leading-[19px] text-ink">
            {DECISION_RULE_COPY}
          </Text>
        </View>
      </View>

      <View className="mt-5 border-t border-line pt-4">
        <SectionLabel>Latest deposit</SectionLabel>
        {latestDeposit ? (
          <View className="mt-2.5 flex-row flex-wrap items-center justify-between gap-3">
            <View className="min-w-0 shrink">
              <Text className="font-sans-semibold text-[13.5px] text-ink">
                {latestDeposit.label}
              </Text>
              <Text className="mt-1 font-mono text-[10.5px] text-ink-dim">
                {truncateAddress(latestDeposit.hash, 10, 6)}
                {latestDeposit.timestampMs === null
                  ? ''
                  : ` · ${formatRelativeTime(latestDeposit.timestampMs, nowMs)}`}
              </Text>
            </View>
            <ExplorerLink
              url={basescanTxUrl(BASESCAN_URL, latestDeposit.hash)}
              label="Basescan"
              accessibilityLabel="View the latest deposit on Basescan"
            />
          </View>
        ) : (
          <Text className="mt-2 text-[12.5px] text-ink-dim">
            {AWAITING_FIRST_ACTION_DETAIL}
          </Text>
        )}
      </View>

      <PrimaryButton
        variant="secondary"
        className="mt-5"
        accessibilityRole="button"
        accessibilityLabel="Watch the story"
        onPress={onWatchStory}
      >
        <Play size={15} color={tokens.color.ink} fill={tokens.color.ink} />
        Watch the story
      </PrimaryButton>
    </Card>
  );
}

function ProbabilityRow({
  label,
  probability,
  chosen,
  threshold,
}: {
  label: string;
  probability: number;
  chosen: boolean;
  threshold?: number;
}) {
  const value = toPercent(probability);
  const valueLabel = formatProbability(probability);
  return (
    <View className="mt-2 flex-row items-center gap-3">
      <Text
        className={
          chosen
            ? 'w-[68px] font-sans-semibold text-[12px] text-ink'
            : 'w-[68px] text-[12px] text-ink-dim'
        }
      >
        {label}
      </Text>
      <View className="relative min-w-0 flex-1 justify-center py-1.5">
        <ProgressBar
          value={value}
          height={8}
          accessibilityLabel={`${label} ${valueLabel}`}
          fillClassName={chosen ? 'bg-accent' : 'bg-ink-faint'}
        />
        {threshold === undefined ? null : (
          <View
            pointerEvents="none"
            className="absolute bottom-0 top-0 w-[2px] rounded-full bg-ink"
            style={{ left: `${toPercent(threshold)}%`, opacity: 0.7 }}
          />
        )}
      </View>
      <Text
        className={
          chosen
            ? 'w-[48px] text-right font-mono-semibold text-[12px] text-accent'
            : 'w-[48px] text-right font-mono text-[12px] text-ink-dim'
        }
      >
        {valueLabel}
      </Text>
    </View>
  );
}
