import { tokens } from '@zapengine/design-tokens/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ExternalLink, Play } from 'lucide-react-native';
import {
  ActivityIndicator,
  Image,
  Linking,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  BASE_BLUE,
  BASE_BLUE_BRIGHT,
} from '@/components/aiWallet/aiWalletTheme';
import { formatPodcastClock } from '@/components/podcast/episodeFormatters';
import { Card } from '@/components/ui/Card';
import { GlowCircle } from '@/components/ui/GlowCircle';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import { DEMO_EPISODE_LANGUAGE } from '@/config/aiWalletDemo';
import {
  getPodcastEpisodeShareUrl,
  podcastEpisodeRoutePath,
  type PodcastEpisode,
} from '@/integration/podcastFeed';
import { cn } from '@/lib/cn';

interface EventVideoCardProps {
  wide: boolean;
  /** `null` when the page was opened without a run link. */
  episodeId: string | null;
  episode: PodcastEpisode | undefined;
  loading: boolean;
  failed: boolean;
  /** A local run is in progress: its video is delivered after the deposit. */
  pending: boolean;
}

const RUN_LINK_HINT =
  "Open the dashboard link from the agent's terminal or Telegram message to see the story it read.";

export function EventVideoCard({
  wide,
  episodeId,
  episode,
  loading,
  failed,
  pending,
}: EventVideoCardProps) {
  const router = useRouter();
  const onWatch =
    pending || episodeId === null || episode === undefined
      ? null
      : () =>
          router.push(
            podcastEpisodeRoutePath(episodeId, DEMO_EPISODE_LANGUAGE),
          );

  return (
    // Opaque, so the thumbnail's fade ends on exactly the card's colour.
    <Card
      className={cn(wide && 'flex-row')}
      style={{ backgroundColor: tokens.color['bg-2'] }}
    >
      <View
        className={cn(
          'relative overflow-hidden',
          wide ? 'min-h-[280px] w-1/2' : 'h-[210px] w-full',
        )}
      >
        {episodeId !== null && loading && episode === undefined ? (
          <SkeletonBlock className="absolute inset-0 rounded-none" />
        ) : (
          <Thumbnail
            wide={wide}
            thumbnailUrl={episode?.video?.thumbnailUrl ?? null}
            onWatch={onWatch}
          />
        )}
        {pending ? <DeliveryPending /> : null}
      </View>
      <View
        className={cn(
          'min-w-0 justify-center gap-3 p-6',
          wide ? 'flex-1' : 'pt-4',
        )}
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text className="font-mono-medium text-[11px] uppercase tracking-[2.4px] text-[#8fb2ff]">
            Event video
          </Text>
          {episode === undefined ? null : (
            <Tap
              accessibilityRole="link"
              accessibilityLabel="Open the story link"
              onPress={() =>
                void Linking.openURL(getPodcastEpisodeShareUrl(episode))
              }
              className="h-9 w-9 items-center justify-center rounded-full border border-line-hi"
            >
              <ExternalLink size={15} color={tokens.color['ink-dim']} />
            </Tap>
          )}
        </View>
        <View className={cn(pending && 'opacity-50')}>
          <StoryDetails
            wide={wide}
            episodeId={episodeId}
            episode={episode}
            loading={loading}
            failed={failed}
          />
        </View>
      </View>
    </Card>
  );
}

function DeliveryPending() {
  return (
    <View className="absolute inset-0 items-center justify-center gap-3 bg-[rgba(10,10,10,.62)] px-6">
      <ActivityIndicator
        size="small"
        color={BASE_BLUE_BRIGHT}
        accessibilityLabel="Video delivery pending"
      />
      <Text className="text-center font-sans-medium text-[13px] leading-[18px] text-ink-dim">
        Delivering after the deposit confirms
      </Text>
    </View>
  );
}

function StoryDetails({
  wide,
  episodeId,
  episode,
  loading,
  failed,
}: Omit<EventVideoCardProps, 'pending'>) {
  if (episodeId === null) {
    return (
      <View>
        <Text className="font-sans-semibold text-[22px] leading-7 text-ink-dim">
          Not provided
        </Text>
        <Text className="mt-1.5 text-[12.5px] leading-[18px] text-ink-faint">
          {RUN_LINK_HINT}
        </Text>
      </View>
    );
  }
  if (episode === undefined) {
    if (loading) {
      return (
        <View className="gap-2">
          <SkeletonBlock className="h-7 w-full rounded-md" />
          <SkeletonBlock className="h-7 w-2/3 rounded-md" />
        </View>
      );
    }
    return (
      <Text className="font-sans-semibold text-[22px] leading-7 text-ink-dim">
        {failed ? 'Story unavailable' : 'Not provided'}
      </Text>
    );
  }
  return (
    <View>
      <Text
        className={cn(
          'font-sans-semibold text-ink',
          wide ? 'text-[28px] leading-[34px]' : 'text-[22px] leading-7',
        )}
        numberOfLines={2}
      >
        {episode.title}
      </Text>
      {episode.video === null ? null : (
        <Text className="mt-3 font-mono text-[13px] text-ink-dim">
          {formatPodcastClock(episode.video.durationSeconds)}
        </Text>
      )}
    </View>
  );
}

function Thumbnail({
  wide,
  thumbnailUrl,
  onWatch,
}: {
  wide: boolean;
  thumbnailUrl: string | null;
  onWatch: (() => void) | null;
}) {
  return (
    <>
      {thumbnailUrl === null ? (
        <View className="absolute inset-0 items-center justify-center bg-[rgba(0,82,255,.06)]">
          <GlowCircle size={320} color={BASE_BLUE} opacity={0.45} />
        </View>
      ) : (
        <Image
          source={{ uri: thumbnailUrl }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          className="absolute inset-0 h-full w-full"
        />
      )}
      <LinearGradient
        colors={['rgba(14,14,16,0)', tokens.color['bg-2']]}
        start={wide ? { x: 0.45, y: 0.5 } : { x: 0.5, y: 0.4 }}
        end={wide ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 }}
        // LinearGradient has no NativeWind interop, so className would be dropped.
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {onWatch === null ? null : (
        <View className="absolute inset-0 items-center justify-center">
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Watch the story"
            onPress={onWatch}
            className="h-16 w-16 items-center justify-center rounded-full border-2 bg-[rgba(10,10,10,.55)]"
            style={{ borderColor: BASE_BLUE_BRIGHT }}
          >
            <Play
              size={22}
              color={tokens.color.ink}
              fill={tokens.color.ink}
              style={{ marginLeft: 3 }}
            />
          </Tap>
        </View>
      )}
    </>
  );
}
