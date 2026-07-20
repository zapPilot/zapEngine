import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { memo, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import type { PodcastEpisodeVideo } from '@/integration/podcastFeed';
import { useVideoPlaybackCoordinator } from '@/providers/VideoPlaybackCoordinatorProvider';

const FULLSCREEN_OPTIONS = { enable: true } as const;
const TIME_UPDATE_INTERVAL_SECONDS = 0.5;

function finiteVideoTime(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds)) return 0;
  if (!Number.isFinite(duration) || duration <= 0) {
    return Math.max(0, seconds);
  }
  return Math.min(Math.max(0, seconds), duration);
}

export const EpisodeVideoPlayer = memo(function EpisodeVideoPlayer({
  title,
  video,
  initialTimeSeconds,
  playbackRate,
  shouldPlay,
  onPlayingChange,
  onPlaybackRateChange,
  onTimeUpdate,
  onPlaybackEnd,
  onPlaybackError,
  onPlaybackExit,
}: {
  title: string;
  video: PodcastEpisodeVideo;
  initialTimeSeconds: number;
  playbackRate: number;
  shouldPlay: boolean;
  onPlayingChange: (isPlaying: boolean) => void;
  onPlaybackRateChange: (rate: number) => void;
  onTimeUpdate: (seconds: number, duration: number) => void;
  onPlaybackEnd: (duration: number) => void;
  onPlaybackError: () => void;
  onPlaybackExit: (seconds: number) => void;
}) {
  const { registerVideo } = useVideoPlaybackCoordinator();
  const source = useMemo(
    () => ({
      uri: video.url,
      contentType: 'progressive' as const,
      metadata: {
        title,
        artwork: video.thumbnailUrl,
      },
    }),
    [title, video.thumbnailUrl, video.url],
  );
  const posterSource = useMemo(
    () => ({ uri: video.thumbnailUrl }),
    [video.thumbnailUrl],
  );
  const player = useVideoPlayer(source, (createdPlayer) => {
    createdPlayer.playbackRate = playbackRate;
    createdPlayer.timeUpdateEventInterval = TIME_UPDATE_INTERVAL_SECONDS;
  });
  const latestTimeRef = useRef(finiteVideoTime(initialTimeSeconds, 0));
  const latestExitHandlerRef = useRef(onPlaybackExit);
  latestExitHandlerRef.current = onPlaybackExit;
  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
  });

  useEffect(() => {
    const unregister = registerVideo(() => player.pause());
    return () => {
      unregister();
      latestExitHandlerRef.current(latestTimeRef.current);
    };
  }, [player, registerVideo]);

  useEventListener(player, 'sourceLoad', ({ duration }) => {
    const actualDuration = duration > 0 ? duration : video.durationSeconds;
    const startTime = finiteVideoTime(initialTimeSeconds, actualDuration);
    latestTimeRef.current = startTime;
    player.currentTime = startTime;
    onTimeUpdate(startTime, actualDuration);
    if (shouldPlay) player.play();
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    onPlayingChange(isPlaying);
  });

  useEventListener(player, 'playbackRateChange', ({ playbackRate: rate }) => {
    onPlaybackRateChange(rate);
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    latestTimeRef.current = currentTime;
    onTimeUpdate(currentTime, player.duration || video.durationSeconds);
  });

  useEventListener(player, 'playToEnd', () => {
    const duration = player.duration || video.durationSeconds;
    latestTimeRef.current = duration;
    onPlaybackEnd(duration);
  });

  useEventListener(player, 'statusChange', ({ status: nextStatus }) => {
    if (nextStatus === 'error') onPlaybackError();
  });

  return (
    <View
      accessibilityLabel={`Video player: ${title}`}
      className="overflow-hidden bg-black"
      style={styles.frame}
    >
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        fullscreenOptions={FULLSCREEN_OPTIONS}
        style={styles.video}
      />
      {status === 'readyToPlay' ? null : (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center bg-black"
        >
          <Image
            accessibilityIgnoresInvertColors
            source={posterSource}
            resizeMode="cover"
            style={styles.poster}
          />
          <View className="absolute inset-0 bg-[rgba(0,0,0,.4)]" />
          <ActivityIndicator
            accessibilityLabel="Loading video"
            color="#f5f1e8"
          />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  poster: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
});
