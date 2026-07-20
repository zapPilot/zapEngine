import Slider from '@react-native-community/slider';
import {
  Gauge,
  Headphones,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
} from 'lucide-react-native';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Text, View } from 'react-native';

import { EpisodeVideoPlayer } from '@/components/podcast/EpisodeVideoPlayer';
import {
  formatPodcastClock,
  nextPodcastPlaybackSpeed,
} from '@/components/podcast/episodeFormatters';
import { Tap } from '@/components/ui/Tap';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { cn } from '@/lib/cn';
import { useEpisodeProgress } from '@/providers/PodcastProgressProvider';

const VIDEO_PROGRESS_PERSIST_INTERVAL_SECONDS = 10;
const VIDEO_COMPLETION_THRESHOLD_SECONDS = 2;

type MediaMode = 'audio' | 'video';

function finiteSeconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

function clampSeconds(seconds: number, duration: number): number {
  const finite = finiteSeconds(seconds);
  return duration > 0 ? Math.min(finite, duration) : finite;
}

export function PodcastIconButton({
  label,
  disabled = false,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'h-11 w-11 items-center justify-center rounded-full border',
        disabled
          ? 'border-line bg-[rgba(255,255,255,.03)] opacity-40'
          : 'border-[rgba(212,197,163,.28)] bg-[rgba(212,197,163,.12)]',
      )}
    >
      {children}
    </Tap>
  );
}

interface EpisodeMediaPlayerProps {
  episode: PodcastEpisode;
  episodes: readonly PodcastEpisode[];
  player: PodcastPlayer;
  onEpisodeChanged: (episode: PodcastEpisode) => void;
}

function MediaModeButton({
  active,
  label,
  hint,
  onPress,
  children,
}: {
  active: boolean;
  label: string;
  hint: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tap
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected: active }}
      aria-selected={active}
      onPress={onPress}
      className={cn(
        'h-11 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-xl',
        active ? 'bg-[rgba(212,197,163,.18)]' : 'bg-transparent opacity-70',
      )}
    >
      {children}
      <Text
        className={cn(
          'font-sans-semibold text-[13px]',
          active ? 'text-accent' : 'text-ink-dim',
        )}
      >
        {label}
      </Text>
    </Tap>
  );
}

function AudioPlaybackControls({
  episode,
  episodes,
  player,
  onEpisodeChanged,
}: EpisodeMediaPlayerProps) {
  const isCurrent =
    player.nowPlaying?.localizationId === episode.localizationId;
  const duration = isCurrent ? Math.floor(player.duration) : 0;
  const currentTime = isCurrent
    ? Math.min(Math.floor(player.currentTime), duration)
    : 0;
  const isPlaying = isCurrent && player.isPlaying;
  const PrimaryPlaybackIcon = isPlaying ? Pause : Play;

  const play = () => player.playFromQueue(episodes, episode);
  const skipPrevious = () => {
    const nextEpisode = player.skipToPreviousEpisode();
    if (nextEpisode !== null) onEpisodeChanged(nextEpisode);
  };
  const skipNext = () => {
    const nextEpisode = player.skipToNextEpisode();
    if (nextEpisode !== null) onEpisodeChanged(nextEpisode);
  };

  return (
    <View className="p-5">
      <Slider
        accessibilityLabel="Seek episode"
        disabled={!isCurrent || duration <= 0}
        minimumValue={0}
        maximumValue={duration > 0 ? duration : 1}
        value={currentTime}
        minimumTrackTintColor="#d4c5a3"
        maximumTrackTintColor="rgba(255,255,255,.12)"
        thumbTintColor="#d4c5a3"
        onSlidingComplete={player.seek}
        style={{ height: 32 }}
      />
      <View className="mt-1 flex-row items-center justify-between px-1">
        <Text className="font-mono text-[10px] text-ink-faint">
          {formatPodcastClock(currentTime)}
        </Text>
        <Text className="font-mono text-[10px] text-ink-faint">
          {formatPodcastClock(duration)}
        </Text>
      </View>

      <View className="mt-5 flex-row items-center justify-between">
        <PodcastIconButton
          label="Rewind 15 seconds"
          disabled={!isCurrent}
          onPress={() => player.seekRelative(-15)}
        >
          <RotateCcw size={19} strokeWidth={2} color="#d4c5a3" />
        </PodcastIconButton>
        <PodcastIconButton
          label="Previous episode"
          disabled={!player.hasPreviousEpisode}
          onPress={skipPrevious}
        >
          <SkipBack size={20} strokeWidth={2} color="#d4c5a3" />
        </PodcastIconButton>
        <Tap
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause episode' : 'Play episode'}
          onPress={play}
          className="h-[72px] w-[72px] items-center justify-center rounded-full border border-[rgba(212,197,163,.35)] bg-[rgba(212,197,163,.18)]"
        >
          <PrimaryPlaybackIcon size={31} strokeWidth={2.1} color="#d4c5a3" />
        </Tap>
        <PodcastIconButton
          label="Next episode"
          disabled={!player.hasNextEpisode}
          onPress={skipNext}
        >
          <SkipForward size={20} strokeWidth={2} color="#d4c5a3" />
        </PodcastIconButton>
        <PodcastIconButton
          label="Forward 30 seconds"
          disabled={!isCurrent}
          onPress={() => player.seekRelative(30)}
        >
          <RotateCw size={19} strokeWidth={2} color="#d4c5a3" />
        </PodcastIconButton>
      </View>

      <View className="mt-5 items-end">
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Change playback speed"
          onPress={() =>
            player.setSpeed(nextPodcastPlaybackSpeed(player.speed))
          }
          className="min-h-11 flex-row items-center gap-2 rounded-full border border-line bg-[rgba(255,255,255,.04)] px-3 py-2"
        >
          <Gauge size={14} strokeWidth={2} color="#a1a1aa" />
          <Text className="font-mono text-[11px] text-ink-dim">
            {player.speed}x
          </Text>
        </Tap>
      </View>
    </View>
  );
}

export function EpisodeMediaPlayer({
  episode,
  episodes,
  player,
  onEpisodeChanged,
}: EpisodeMediaPlayerProps) {
  const [mode, setMode] = useState<MediaMode>('audio');
  const [videoSession, setVideoSession] = useState<{
    initialTimeSeconds: number;
    playbackRate: number;
    shouldPlay: boolean;
  } | null>(null);
  const { markListened, setPosition } = useEpisodeProgress();
  const videoTimeRef = useRef(finiteSeconds(episode.lastPositionSeconds));
  const videoDurationRef = useRef(episode.video?.durationSeconds ?? 0);
  const videoPlayingRef = useRef(false);
  const videoRateRef = useRef(player.speed);
  const lastPersistedVideoTimeRef = useRef(
    Math.floor(finiteSeconds(episode.lastPositionSeconds)),
  );
  const videoFailureHandledRef = useRef(false);

  const isCurrentAudio =
    player.nowPlaying?.localizationId === episode.localizationId;
  const audioHandoffTime = isCurrentAudio
    ? finiteSeconds(player.currentTime)
    : finiteSeconds(episode.lastPositionSeconds);

  const persistVideoPosition = useCallback(
    (seconds: number, force = false) => {
      const roundedSeconds = Math.floor(finiteSeconds(seconds));
      if (roundedSeconds <= 0) return;
      if (
        !force &&
        Math.abs(roundedSeconds - lastPersistedVideoTimeRef.current) <
          VIDEO_PROGRESS_PERSIST_INTERVAL_SECONDS
      ) {
        return;
      }
      lastPersistedVideoTimeRef.current = roundedSeconds;
      setPosition(episode.localizationId, roundedSeconds);
    },
    [episode.localizationId, setPosition],
  );

  useEffect(
    () => () => {
      if (mode === 'video') {
        persistVideoPosition(videoTimeRef.current, true);
      }
    },
    [mode, persistVideoPosition],
  );

  const showVideo = () => {
    if (episode.video === null || mode === 'video') return;
    const initialTimeSeconds = clampSeconds(
      audioHandoffTime,
      episode.video.durationSeconds,
    );
    const shouldPlay = isCurrentAudio ? player.isPlaying : true;
    videoTimeRef.current = initialTimeSeconds;
    videoDurationRef.current = episode.video.durationSeconds;
    videoPlayingRef.current = shouldPlay;
    videoRateRef.current = player.speed;
    videoFailureHandledRef.current = false;
    player.pause();
    setVideoSession({
      initialTimeSeconds,
      playbackRate: player.speed,
      shouldPlay,
    });
    setMode('video');
  };

  const continueWithAudio = useCallback(
    (shouldPlay = videoPlayingRef.current) => {
      const position = clampSeconds(
        videoTimeRef.current,
        videoDurationRef.current,
      );
      persistVideoPosition(position, true);
      player.setSpeed(videoRateRef.current);
      player.playFromQueueAt(episodes, episode, position, shouldPlay);
      setMode('audio');
      setVideoSession(null);
    },
    [episode, episodes, persistVideoPosition, player],
  );

  const handleVideoTimeUpdate = useCallback(
    (seconds: number, duration: number) => {
      const position = clampSeconds(seconds, duration);
      videoTimeRef.current = position;
      videoDurationRef.current = duration;
      persistVideoPosition(position);
      if (
        duration > 0 &&
        duration - position <= VIDEO_COMPLETION_THRESHOLD_SECONDS
      ) {
        markListened(episode.localizationId, true);
      }
    },
    [episode.localizationId, markListened, persistVideoPosition],
  );

  const handleVideoEnd = useCallback(
    (duration: number) => {
      const finalPosition = finiteSeconds(duration);
      videoTimeRef.current = finalPosition;
      videoDurationRef.current = finalPosition;
      persistVideoPosition(finalPosition, true);
      markListened(episode.localizationId, true);
    },
    [episode.localizationId, markListened, persistVideoPosition],
  );

  const handleVideoError = useCallback(() => {
    if (videoFailureHandledRef.current) return;
    videoFailureHandledRef.current = true;
    continueWithAudio(videoPlayingRef.current);
  }, [continueWithAudio]);

  const video = episode.video;
  const showModeControl = video !== null;

  return (
    <View className="px-5 pt-5">
      <View className="overflow-hidden rounded-[28px] border border-line bg-surface">
        {showModeControl ? (
          <View className="border-b border-line p-3">
            <View className="flex-row rounded-2xl bg-[rgba(255,255,255,.045)] p-1">
              <MediaModeButton
                active={mode === 'audio'}
                label="Listen"
                hint="Use the audio-only player"
                onPress={() => {
                  if (mode === 'video') continueWithAudio();
                }}
              >
                <Headphones
                  size={17}
                  strokeWidth={2}
                  color={mode === 'audio' ? '#d4c5a3' : '#a1a1aa'}
                />
              </MediaModeButton>
              <MediaModeButton
                active={mode === 'video'}
                label="Watch"
                hint={`Continue video from ${formatPodcastClock(audioHandoffTime)}`}
                onPress={showVideo}
              >
                <MonitorPlay
                  size={17}
                  strokeWidth={2}
                  color={mode === 'video' ? '#d4c5a3' : '#a1a1aa'}
                />
              </MediaModeButton>
            </View>
            <Text className="mt-2 px-1 text-right font-mono text-[10px] text-ink-faint">
              {mode === 'audio'
                ? `Video continues from ${formatPodcastClock(audioHandoffTime)}`
                : 'Switch to Listen to continue with audio only'}
            </Text>
          </View>
        ) : null}

        {mode === 'video' && video !== null && videoSession !== null ? (
          <EpisodeVideoPlayer
            title={episode.title}
            video={video}
            initialTimeSeconds={videoSession.initialTimeSeconds}
            playbackRate={videoSession.playbackRate}
            shouldPlay={videoSession.shouldPlay}
            onPlayingChange={(isPlaying) => {
              videoPlayingRef.current = isPlaying;
            }}
            onPlaybackRateChange={(rate) => {
              videoRateRef.current = rate;
            }}
            onTimeUpdate={handleVideoTimeUpdate}
            onPlaybackEnd={handleVideoEnd}
            onPlaybackError={handleVideoError}
            onPlaybackExit={(seconds) => {
              videoTimeRef.current = finiteSeconds(seconds);
              persistVideoPosition(seconds, true);
            }}
          />
        ) : (
          <AudioPlaybackControls
            episode={episode}
            episodes={episodes}
            player={player}
            onEpisodeChanged={onEpisodeChanged}
          />
        )}
      </View>
    </View>
  );
}
