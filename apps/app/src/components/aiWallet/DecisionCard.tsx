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
import { BASESCAN_URL, FIXED_ACTION_COPY } from '@/config/aiWalletDemo';
import {
  basescanTxUrl,
  formatRelativeTime,
  type AgentTransaction,
} from '@/integration/agentActivity';
import {
  ANALYSIS_NOT_PROVIDED,
  AWAITING_FIRST_ACTION_DETAIL,
  formatProbability,
} from '@/integration/agentLoopModel';
import {
  LAYA_PRESSURES,
  type LayaAnalysis,
} from '@/integration/agentRunContext';
import { truncateAddress } from '@/lib/format';

interface DecisionCardProps {
  /** `null` when the page was opened without a run link. */
  headline: string | null;
  headlineLoading: boolean;
  analysis: LayaAnalysis | null;
  latestDeposit: AgentTransaction | null;
  nowMs: number;
  onWatchStory: (() => void) | null;
}

const PRESSURE_LABELS = {
  upward: 'Upward',
  downward: 'Downward',
  none: 'None',
} as const;

const RUN_LINK_HINT =
  "Open the dashboard link from the agent's terminal or Telegram message to see the story it read.";

function toPercent(probability: number): number {
  return probability * 100;
}

export function DecisionCard({
  headline,
  headlineLoading,
  analysis,
  latestDeposit,
  nowMs,
  onWatchStory,
}: DecisionCardProps) {
  return (
    <Card className="p-5">
      <CardHeading eyebrow="This run" title="What the agent read" />

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
          {headline === null || headlineLoading ? null : (
            <StatusBadge tone="live">Live feed</StatusBadge>
          )}
        </View>
        {headlineLoading ? (
          <View className="mt-3 gap-2">
            <SkeletonBlock className="h-5 w-full rounded-md" />
            <SkeletonBlock className="h-5 w-3/4 rounded-md" />
          </View>
        ) : headline === null ? (
          <NotProvided hint={RUN_LINK_HINT} />
        ) : (
          <Text className="mt-2.5 font-serif text-[22px] leading-[27px] text-ink">
            {headline}
          </Text>
        )}
      </View>

      <View className="mt-5">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View className="flex-row items-center gap-2">
            <SectionLabel>Laya&apos;s analysis</SectionLabel>
            <Text className="font-mono text-[10px] text-ink-faint">
              local model · context only
            </Text>
          </View>
          {analysis === null ? null : (
            <StatusBadge tone="snapshot">From run link</StatusBadge>
          )}
        </View>
        {analysis === null ? (
          <NotProvided hint="The agent acts the same way without it." />
        ) : (
          <LayaAnalysisRows analysis={analysis} />
        )}
      </View>

      <View className="mt-5 flex-row gap-3 rounded-2xl border border-[rgba(212,197,163,.22)] bg-[rgba(212,197,163,.05)] p-4">
        <Scale size={16} color={tokens.color.accent} strokeWidth={1.8} />
        <View className="min-w-0 flex-1">
          <SectionLabel className="text-[#9a8f78]">Fixed action</SectionLabel>
          <Text className="mt-1.5 text-[12.5px] leading-[19px] text-ink">
            {FIXED_ACTION_COPY}
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

      {onWatchStory === null ? null : (
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
      )}
    </Card>
  );
}

function NotProvided({ hint }: { hint: string }) {
  return (
    <View className="mt-2.5">
      <Text className="font-sans-semibold text-[14px] text-ink-dim">
        {ANALYSIS_NOT_PROVIDED}
      </Text>
      <Text className="mt-1 text-[11.5px] leading-[17px] text-ink-faint">
        {hint}
      </Text>
    </View>
  );
}

function LayaAnalysisRows({ analysis }: { analysis: LayaAnalysis }) {
  const pressures = LAYA_PRESSURES.flatMap((key) => {
    const probability = analysis.probabilities[key];
    return probability === undefined ? [] : [{ key, probability }];
  });
  return (
    <>
      <Text className="mt-3 text-[12.5px] text-ink-dim">
        Is this an exchange hack?
      </Text>
      <ProbabilityRow label="Yes" probability={analysis.exchangeHack} chosen />
      <Text className="mt-4 text-[12.5px] text-ink-dim">
        Which way does it push ETH?
      </Text>
      {pressures.length === 0 ? (
        <Text className="mt-2 text-[12px] text-ink">
          {PRESSURE_LABELS[analysis.pressure]}
        </Text>
      ) : (
        pressures.map(({ key, probability }) => (
          <ProbabilityRow
            key={key}
            label={PRESSURE_LABELS[key]}
            probability={probability}
            chosen={key === analysis.pressure}
          />
        ))
      )}
    </>
  );
}

function ProbabilityRow({
  label,
  probability,
  chosen,
}: {
  label: string;
  probability: number;
  chosen: boolean;
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
