import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { AgentTimeline } from '@/components/aiWallet/AgentTimeline';
import { AgentWalletCard } from '@/components/aiWallet/AgentWalletCard';
import { AiWalletHeader } from '@/components/aiWallet/AiWalletHeader';
import { BASE_BLUE } from '@/components/aiWallet/aiWalletTheme';
import { EventVideoCard } from '@/components/aiWallet/EventVideoCard';
import { useAgentLoopPlayback } from '@/components/aiWallet/useAgentLoopPlayback';
import { useLocalAgentTrigger } from '@/components/aiWallet/useLocalAgentTrigger';
import { GlowCircle } from '@/components/ui/GlowCircle';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { AGENT_ADDRESS, DEMO_EPISODE_LANGUAGE } from '@/config/aiWalletDemo';
import { latestConfirmedDeposit } from '@/integration/agentActivity';
import {
  AGENT_LOOP_STEPS,
  replayButtonLabel,
} from '@/integration/agentLoopModel';
import { parseRunEpisodeId } from '@/integration/agentRunContext';
import { usePodcastEpisode } from '@/integration/podcastFeed';
import {
  AGENT_CONFIGURED,
  useAgentPosition,
  useAgentTransactions,
} from '@/integration/useAgentActivity';

const WIDE_LAYOUT_MIN_WIDTH = 900;

export function AiWalletScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const params = useLocalSearchParams();
  const episodeId = useMemo(() => parseRunEpisodeId(params), [params]);

  const transactions = useAgentTransactions();
  const episode = usePodcastEpisode(episodeId ?? '', DEMO_EPISODE_LANGUAGE);

  const latestDeposit = useMemo(
    () => latestConfirmedDeposit(transactions.data ?? []),
    [transactions.data],
  );
  const position = useAgentPosition(latestDeposit?.hash ?? null);
  const { playback, replay } = useAgentLoopPlayback({
    latestDepositHash: latestDeposit?.hash ?? null,
    activityLoaded: transactions.isSuccess,
    stepCount: AGENT_LOOP_STEPS.length,
  });

  const agentTrigger = useLocalAgentTrigger(latestDeposit?.hash ?? null);

  const title = episode.data?.title.trim() ?? '';
  const eventTitle = title === '' ? null : title;

  const wallet = (
    <AgentWalletCard
      fill={wide}
      agentAddress={AGENT_ADDRESS}
      configured={AGENT_CONFIGURED}
      position={position.data}
      loading={position.isLoading}
      failed={position.isError}
    />
  );
  const timeline = (
    <AgentTimeline
      playback={playback}
      latestDeposit={latestDeposit}
      awaitingFirstAction={
        !AGENT_CONFIGURED || (transactions.isSuccess && latestDeposit === null)
      }
      stretch={wide}
    />
  );

  return (
    <ScreenScrollView>
      <View className="relative w-full">
        {/* Clipped so the glows never widen the page into a horizontal scroll on web. */}
        <View
          className="absolute inset-x-0 bottom-0 top-[-80px] overflow-hidden"
          pointerEvents="none"
        >
          <GlowCircle
            size={760}
            color={BASE_BLUE}
            opacity={0.3}
            className="left-[-300px] top-[-220px]"
          />
          <GlowCircle
            size={680}
            color={BASE_BLUE}
            opacity={0.16}
            className="right-[-280px] top-[360px]"
          />
        </View>

        <View className="w-full max-w-[1200px] self-center">
          <AiWalletHeader
            wide={wide}
            configured={AGENT_CONFIGURED}
            reconnecting={transactions.isError}
            replayLabel={replayButtonLabel(playback, eventTitle)}
            replayDisabled={latestDeposit === null || playback !== null}
            onReplay={replay}
            runNow={
              agentTrigger.available
                ? { busy: agentTrigger.busy, onPress: agentTrigger.trigger }
                : null
            }
          />
          {wide ? (
            <View className="mt-8 flex-row items-stretch gap-10 px-5">
              <View className="w-[46%]">{wallet}</View>
              <View className="min-w-0 flex-1 py-2">{timeline}</View>
            </View>
          ) : (
            <View className="mt-6 gap-7 px-5">
              {wallet}
              {timeline}
            </View>
          )}
          <View className={wide ? 'mt-8 px-5' : 'mt-7 px-5'}>
            <EventVideoCard
              wide={wide}
              episodeId={episodeId}
              episode={episode.data}
              loading={episode.isLoading}
              failed={episode.isError}
            />
          </View>
        </View>
      </View>
    </ScreenScrollView>
  );
}
