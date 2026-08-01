import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { memo, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { isVideoHandoffSeekConfirmed } from '@/integration/episodeMediaSync';
import type { PodcastEpisodeVideo } from '@/integration/podcastFeed';
import { useVideoPlaybackCoordinator } from '@/providers/VideoPlaybackCoordinatorProvider';

const FULLSCREEN_OPTIONS = { enable: true } as const;
const TIME_UPDATE_INTERVAL_SECONDS = 0.5;
const HANDOFF_SEEK_FALLBACK_MS = 1_500;

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
  const pendingAutoplayTargetRef = useRef<number | null>(null);
  const pendingAutoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  latestExitHandlerRef.current = onPlaybackExit;
  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
  });

  useEffect(() => {
    const unregister = registerVideo(() => player.pause());
    return () => {
      unregister();
      pendingAutoplayTargetRef.current = null;
      if (pendingAutoplayTimerRef.current !== null) {
        clearTimeout(pendingAutoplayTimerRef.current);
        pendingAutoplayTimerRef.current = null;
      }
      latestExitHandlerRef.current(latestTimeRef.current);
    };
  }, [player, registerVideo]);

  const clearPendingAutoplay = () => {
    pendingAutoplayTargetRef.current = null;
    if (pendingAutoplayTimerRef.current !== null) {
      clearTimeout(pendingAutoplayTimerRef.current);
      pendingAutoplayTimerRef.current = null;
    }
  };

  const queueAutoplayAfterSeek = (targetSeconds: number) => {
    clearPendingAutoplay();
    pendingAutoplayTargetRef.current = targetSeconds;
    pendingAutoplayTimerRef.current = setTimeout(() => {
      if (pendingAutoplayTargetRef.current !== targetSeconds) return;
      pendingAutoplayTargetRef.current = null;
      pendingAutoplayTimerRef.current = null;
      // Some native backends do not emit timeUpdate while paused after an
      // initial seek. Re-issue the target before the bounded fallback play.
      player.currentTime = targetSeconds;
      player.play();
    }, HANDOFF_SEEK_FALLBACK_MS);
  };

  useEventListener(player, 'sourceLoad', ({ duration }) => {
    const actualDuration = duration > 0 ? duration : video.durationSeconds;
    const startTime = finiteVideoTime(initialTimeSeconds, actualDuration);
    latestTimeRef.current = startTime;
    player.pause();
    player.currentTime = startTime;
    onTimeUpdate(startTime, actualDuration);
    if (!shouldPlay) {
      clearPendingAutoplay();
      return;
    }
    if (isVideoHandoffSeekConfirmed(startTime, 0)) {
      clearPendingAutoplay();
      player.play();
      return;
    }
    queueAutoplayAfterSeek(startTime);
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    onPlayingChange(isPlaying);
  });

  useEventListener(player, 'playbackRateChange', ({ playbackRate: rate }) => {
    onPlaybackRateChange(rate);
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    latestTimeRef.current = currentTime;
    const pendingTarget = pendingAutoplayTargetRef.current;
    if (
      pendingTarget !== null &&
      isVideoHandoffSeekConfirmed(currentTime, pendingTarget)
    ) {
      clearPendingAutoplay();
      player.play();
    }
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
