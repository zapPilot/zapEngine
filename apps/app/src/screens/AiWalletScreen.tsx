import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { AgentHeroCard } from '@/components/aiWallet/AgentHeroCard';
import { AgentLoopCard } from '@/components/aiWallet/AgentLoopCard';
import { DecisionCard } from '@/components/aiWallet/DecisionCard';
import { OnChainActivityCard } from '@/components/aiWallet/OnChainActivityCard';
import { PulseDot } from '@/components/aiWallet/PulseDot';
import { useAgentLoopPlayback } from '@/components/aiWallet/useAgentLoopPlayback';
import { Pill } from '@/components/ui/Pill';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { AGENT_ADDRESS, DEMO_EPISODE_LANGUAGE } from '@/config/aiWalletDemo';
import { useNowTicker } from '@/hooks/useNowTicker';
import {
  formatRelativeTime,
  latestAgentActionTimestamp,
  latestConfirmedDeposit,
} from '@/integration/agentActivity';
import { agentLoopSteps } from '@/integration/agentLoopModel';
import { parseAgentRunContext } from '@/integration/agentRunContext';
import {
  podcastEpisodeRoutePath,
  usePodcastEpisode,
} from '@/integration/podcastFeed';
import {
  AGENT_CONFIGURED,
  useAgentPosition,
  useAgentTransactions,
} from '@/integration/useAgentActivity';

const WIDE_LAYOUT_MIN_WIDTH = 900;

export function AiWalletScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const nowMs = useNowTicker(true);
  const params = useLocalSearchParams();
  const run = useMemo(() => parseAgentRunContext(params), [params]);
  const steps = useMemo(() => agentLoopSteps(run.analysis), [run.analysis]);

  const transactions = useAgentTransactions();
  const episode = usePodcastEpisode(run.episodeId ?? '', DEMO_EPISODE_LANGUAGE);

  const latestDeposit = useMemo(
    () => latestConfirmedDeposit(transactions.data ?? []),
    [transactions.data],
  );
  const position = useAgentPosition(latestDeposit?.hash ?? null);
  const lastActionMs = useMemo(
    () => latestAgentActionTimestamp(transactions.data ?? []),
    [transactions.data],
  );
  const { playback, replay } = useAgentLoopPlayback({
    latestDepositHash: latestDeposit?.hash ?? null,
    activityLoaded: transactions.isSuccess,
    stepCount: steps.length,
  });

  const liveHeadline = episode.data?.title.trim() ?? '';
  const episodeId = run.episodeId;

  const hero = (
    <AgentHeroCard
      agentAddress={AGENT_ADDRESS}
      configured={AGENT_CONFIGURED}
      position={position.data}
      loading={position.isLoading}
      failed={position.isError}
    />
  );
  const decision = (
    <DecisionCard
      headline={liveHeadline === '' ? null : liveHeadline}
      headlineLoading={episode.isLoading}
      analysis={run.analysis}
      latestDeposit={latestDeposit}
      nowMs={nowMs}
      onWatchStory={
        episodeId === null
          ? null
          : () =>
              router.push(
                podcastEpisodeRoutePath(episodeId, DEMO_EPISODE_LANGUAGE),
              )
      }
    />
  );
  const loop = (
    <AgentLoopCard
      steps={steps}
      playback={playback}
      latestDeposit={latestDeposit}
      nowMs={nowMs}
      onReplay={replay}
    />
  );
  const activity = (
    <OnChainActivityCard
      agentAddress={AGENT_ADDRESS}
      configured={AGENT_CONFIGURED}
      transactions={transactions.data}
      loading={transactions.isLoading}
      failed={transactions.isError}
      nowMs={nowMs}
    />
  );

  return (
    <ScreenScrollView>
      <View className="w-full max-w-[1200px] self-center">
        <AiWalletHeader lastActionMs={lastActionMs} nowMs={nowMs} />
        <Text className="mt-2 px-5 text-[13px] leading-5 text-ink-dim">
          Reads a news story, has local Laya analyze it, then makes one fixed,
          guardrailed move: exactly 1 USDC into the Spark vault. Every step is
          checkable on Base.
        </Text>
        {wide ? (
          <View className="mt-6 flex-row items-start gap-5 px-5">
            <View className="min-w-0 flex-1 gap-5" style={{ flexBasis: 0 }}>
              {hero}
              {decision}
            </View>
            <View className="min-w-0 flex-1 gap-5" style={{ flexBasis: 0 }}>
              {loop}
              {activity}
            </View>
          </View>
        ) : (
          <View className="mt-5 gap-4 px-5">
            {hero}
            {decision}
            {loop}
            {activity}
          </View>
        )}
      </View>
    </ScreenScrollView>
  );
}

function AiWalletHeader({
  lastActionMs,
  nowMs,
}: {
  lastActionMs: number | null;
  nowMs: number;
}) {
  const status =
    lastActionMs === null
      ? 'Guardrailed agent · awaiting first action'
      : `Guardrailed agent · last action ${formatRelativeTime(lastActionMs, nowMs)}`;
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 pt-2">
      <Text className="font-serif text-[27px] leading-none text-ink">
        AI Wallet
      </Text>
      <Pill className="max-w-full border border-[rgba(122,216,143,.3)] bg-[rgba(122,216,143,.07)] py-1 pl-1 pr-3">
        <PulseDot />
        <Text
          className="shrink font-sans-medium text-[11.5px] text-ink"
          numberOfLines={1}
        >
          {status}
        </Text>
      </Pill>
    </View>
  );
}
