import Slider from '@react-native-community/slider';
import {
  Gauge,
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
import {
  episodeMediaTabAvailability,
  type EpisodeMediaTab,
  resolveActiveEpisodeMediaTab,
} from '@/integration/episodeMediaTabs';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import type { PodcastSectionKind } from '@/integration/podcastSections';
import { cn } from '@/lib/cn';
import { useEpisodeProgress } from '@/providers/PodcastProgressProvider';

const VIDEO_PROGRESS_PERSIST_INTERVAL_SECONDS = 10;
const VIDEO_COMPLETION_THRESHOLD_SECONDS = 2;

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

function EpisodeMediaTabButton({
  active,
  label,
  hint,
  onPress,
}: {
  active: boolean;
  label: string;
  hint: string;
  onPress: () => void;
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
        'h-11 min-w-0 flex-1 items-center justify-center rounded-xl',
        active ? 'bg-[rgba(212,197,163,.18)]' : 'bg-transparent opacity-70',
      )}
    >
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

function UnavailableMediaPanel({
  message,
  label,
}: {
  message: string;
  label: string;
}) {
  return (
    <View
      nativeID="episode-media-panel"
      role="tabpanel"
      accessibilityLabel={`${label} player`}
      className="min-h-[220px] items-center justify-center p-5"
    >
      <Text className="text-center font-sans-semibold text-[15px] text-ink">
        {message}
      </Text>
      <Text className="mt-2 text-center text-[12px] leading-[18px] text-ink-dim">
        Choose another tab to keep listening.
      </Text>
    </View>
  );
}

function AudioPlaybackControls({
  episode,
  episodes,
  player,
  onEpisodeChanged,
  section,
}: EpisodeMediaPlayerProps & { section: PodcastSectionKind }) {
  const isCurrentEpisode =
    player.nowPlaying?.localizationId === episode.localizationId;
  const isCurrent = isCurrentEpisode && player.currentSection === section;
  const duration = isCurrent ? Math.floor(player.duration) : 0;
  const currentTime = isCurrent
    ? Math.min(Math.floor(player.currentTime), duration)
    : 0;
  const isPlaying = isCurrent && player.isPlaying;
  const PrimaryPlaybackIcon = isPlaying ? Pause : Play;
  const isClassroomSection = section === 'classroom';

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
            {player.speed}x{isClassroomSection ? ' · Classroom' : ''}
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
  const [selectedTab, setSelectedTab] = useState<EpisodeMediaTab>('story');
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
  const availability = episodeMediaTabAvailability(episode);
  const activeTab = resolveActiveEpisodeMediaTab({
    selectedTab,
    isCurrentAudio: isCurrentAudio && availability[selectedTab],
    currentSection: player.currentSection,
    isVideoActive: selectedTab === 'video',
  });
  const activeAudioSection: PodcastSectionKind =
    activeTab === 'classroom' ? 'classroom' : 'main';
  // The video is the main narration. When the classroom section is playing,
  // the main narration has finished, so hand off at the video's end rather than
  // the classroom-relative position.
  const audioHandoffTime = !isCurrentAudio
    ? finiteSeconds(episode.lastPositionSeconds)
    : player.currentSection === 'classroom'
      ? finiteSeconds(episode.video?.durationSeconds ?? 0)
      : finiteSeconds(player.currentTime);

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
      if (videoSession !== null) {
        persistVideoPosition(videoTimeRef.current, true);
      }
    },
    [persistVideoPosition, videoSession],
  );

  const showVideo = () => {
    setSelectedTab('video');
    if (episode.video === null || videoSession !== null) return;
    const initialTimeSeconds = clampSeconds(
      audioHandoffTime,
      episode.video.durationSeconds,
    );
    const shouldPlay = player.isPlaying;
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
  };

  const continueWithAudio = useCallback(
    (
      section: PodcastSectionKind = 'main',
      shouldPlay = videoPlayingRef.current,
    ) => {
      const position = clampSeconds(
        videoTimeRef.current,
        videoDurationRef.current,
      );
      persistVideoPosition(position, true);
      player.setSpeed(videoRateRef.current);
      player.playSectionFromQueue(episodes, episode, section, {
        atSeconds: section === 'main' ? position : 0,
        shouldPlay,
      });
      setSelectedTab(section === 'classroom' ? 'classroom' : 'story');
      setVideoSession(null);
    },
    [episode, episodes, persistVideoPosition, player],
  );

  const selectAudioTab = (tab: 'story' | 'classroom') => {
    const section: PodcastSectionKind =
      tab === 'classroom' ? 'classroom' : 'main';
    setSelectedTab(tab);
    if (!availability[tab]) return;

    if (videoSession !== null) {
      continueWithAudio(section);
      return;
    }
    if (isCurrentAudio && player.currentSection === section) return;
    player.playSectionFromQueue(episodes, episode, section, {
      shouldPlay: player.isPlaying,
    });
  };

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
    continueWithAudio('main', videoPlayingRef.current);
  }, [continueWithAudio]);

  const video = episode.video;

  return (
    <View className="px-5 pt-5">
      <View className="overflow-hidden rounded-[28px] border border-line bg-surface">
        <View className="border-b border-line p-3">
          <View
            accessibilityRole="tablist"
            accessibilityLabel="Episode media"
            className="flex-row rounded-2xl bg-[rgba(255,255,255,.045)] p-1"
          >
            <EpisodeMediaTabButton
              active={activeTab === 'story'}
              label="Story"
              hint="Use the story audio player"
              onPress={() => selectAudioTab('story')}
            />
            <EpisodeMediaTabButton
              active={activeTab === 'classroom'}
              label="Classroom"
              hint={
                availability.classroom
                  ? 'Use the language classroom audio player'
                  : 'Classroom isn’t available for this episode'
              }
              onPress={() => selectAudioTab('classroom')}
            />
            <EpisodeMediaTabButton
              active={activeTab === 'video'}
              label="Video"
              hint={
                availability.video
                  ? `Continue video from ${formatPodcastClock(audioHandoffTime)}`
                  : 'Video isn’t available yet'
              }
              onPress={showVideo}
            />
          </View>
        </View>

        {activeTab === 'video' ? (
          video !== null && videoSession !== null ? (
            <View
              nativeID="episode-media-panel"
              role="tabpanel"
              accessibilityLabel="Video player"
            >
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
            </View>
          ) : (
            <UnavailableMediaPanel
              label="Video"
              message="Video isn’t available yet"
            />
          )
        ) : activeTab === 'classroom' && !availability.classroom ? (
          <UnavailableMediaPanel
            label="Classroom"
            message="Classroom isn’t available for this episode"
          />
        ) : (
          <View
            nativeID="episode-media-panel"
            role="tabpanel"
            accessibilityLabel={
              activeAudioSection === 'classroom'
                ? 'Classroom player'
                : 'Story player'
            }
          >
            <AudioPlaybackControls
              episode={episode}
              episodes={episodes}
              player={player}
              onEpisodeChanged={onEpisodeChanged}
              section={activeAudioSection}
            />
          </View>
        )}
      </View>
    </View>
  );
}
