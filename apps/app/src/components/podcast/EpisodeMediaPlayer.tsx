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
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Text,
  View,
} from 'react-native';

import { EpisodeVideoPlayer } from '@/components/podcast/EpisodeVideoPlayer';
import {
  classroomLanguageLabel,
  formatPodcastClock,
  nextPodcastPlaybackSpeed,
} from '@/components/podcast/episodeFormatters';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Tap } from '@/components/ui/Tap';
import {
  episodeMediaTabAvailability,
  episodeVideoPanelState,
  type EpisodeMediaTab,
  type EpisodeVideoPanelState,
  resolveActiveClassroomLanguage,
  resolveActiveEpisodeMediaTab,
} from '@/integration/episodeMediaTabs';
import {
  handoffAudioToVideo,
  type EpisodeMediaClock,
  type VideoHandoffSession,
} from '@/integration/episodeMediaSync';
import {
  episodeVideoProgressView,
  type EpisodeVideoProgressView,
} from '@/integration/episodeVideoProgress';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import {
  clampPodcastPlaybackSeconds,
  finiteSeconds,
} from '@/integration/podcastPlayerShared';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import {
  buildPlaybackSections,
  type PodcastSectionKind,
} from '@/integration/podcastSections';
import { cn } from '@/lib/cn';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useEpisodeProgress } from '@/providers/PodcastProgressProvider';

const VIDEO_PROGRESS_PERSIST_INTERVAL_SECONDS = 10;
const VIDEO_COMPLETION_THRESHOLD_SECONDS = 2;

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
  onVideoClockChange?: (clock: EpisodeMediaClock | null) => void;
}

function EpisodeMediaTabButton({
  active,
  label,
  hint,
  busy = false,
  onPress,
}: {
  active: boolean;
  label: string;
  hint: string;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected: active, busy }}
      aria-selected={active}
      onPress={onPress}
      className={cn(
        'h-11 min-w-0 flex-1 items-center justify-center rounded-xl',
        active ? 'bg-[rgba(212,197,163,.18)]' : 'bg-transparent opacity-70',
      )}
    >
      <View className="flex-row items-center gap-2">
        {busy ? (
          <ActivityIndicator
            accessibilityLabel={`${label} is being generated`}
            color="#d4c5a3"
            size="small"
          />
        ) : null}
        <Text
          className={cn(
            'font-sans-semibold text-[13px]',
            active ? 'text-accent' : 'text-ink-dim',
          )}
        >
          {label}
        </Text>
      </View>
    </Tap>
  );
}

function UnavailableMediaPanel({
  message,
  label,
  accessory,
  detail = 'Choose another tab to keep listening.',
  action,
  liveRegion,
}: {
  message: string;
  label: string;
  accessory?: ReactNode;
  detail?: string;
  action?: { label: string; onPress: () => void };
  liveRegion?: 'polite';
}) {
  return (
    <View
      nativeID="episode-media-panel"
      role="tabpanel"
      accessibilityLabel={`${label} player`}
      className="min-h-[220px] items-center justify-center p-5"
    >
      {accessory === undefined ? null : (
        <View className="mb-4">{accessory}</View>
      )}
      <Text
        accessibilityLiveRegion={liveRegion}
        className="text-center font-sans-semibold text-[15px] text-ink"
      >
        {message}
      </Text>
      <Text className="mt-2 text-center text-[12px] leading-[18px] text-ink-dim">
        {detail}
      </Text>
      {action === undefined ? null : (
        <PrimaryButton
          accessibilityRole="button"
          accessibilityLabel={action.label}
          className="mt-4"
          onPress={action.onPress}
        >
          {action.label}
        </PrimaryButton>
      )}
    </View>
  );
}

function EpisodeVideoProgressAccessory({
  percent,
  stageLabel,
}: EpisodeVideoProgressView) {
  return (
    // A definite width: it gives ProgressBar's `w-full` track something to
    // measure inside the panel's `items-center` column, which has none.
    <View className="w-[240px]">
      <ProgressBar value={percent} accessibilityLabel="Generating video" />
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="font-sans-medium text-[12px] text-ink-dim">
          {stageLabel ?? 'Video is rendering'}
        </Text>
        <Text className="font-mono text-[11px] text-accent">{percent}%</Text>
      </View>
    </View>
  );
}

function EpisodeVideoStatusPanel({
  state,
  progress,
  onPlay,
}: {
  state: EpisodeVideoPanelState;
  progress: EpisodeVideoProgressView | null;
  onPlay: () => void;
}) {
  const previousStateRef = useRef(state);

  useEffect(() => {
    if (
      Platform.OS === 'ios' &&
      previousStateRef.current !== 'ready' &&
      state === 'ready'
    ) {
      AccessibilityInfo.announceForAccessibility('Video is ready');
    }
    previousStateRef.current = state;
  }, [state]);

  switch (state) {
    case 'generating':
      return (
        <UnavailableMediaPanel
          label="Video"
          message="Video is being generated"
          detail="This page updates automatically while the video renders."
          liveRegion="polite"
          accessory={
            // The label is identical on both branches, so a screen reader (and
            // any test) finds the same control whether or not the server
            // reported progress.
            progress === null ? (
              <ActivityIndicator
                accessibilityLabel="Generating video"
                color="#f5f1e8"
              />
            ) : (
              <EpisodeVideoProgressAccessory
                percent={progress.percent}
                stageLabel={progress.stageLabel}
              />
            )
          }
        />
      );
    case 'failed':
      return (
        <View
          nativeID="episode-media-panel"
          role="tabpanel"
          accessibilityLabel="Video player"
          className="min-h-[220px] justify-center p-5"
        >
          <InlineErrorCard
            title="Video unavailable"
            body="Video generation failed for this episode. Story and Classroom audio still work."
          />
        </View>
      );
    case 'ready':
      return (
        <UnavailableMediaPanel
          label="Video"
          message="Video is ready"
          liveRegion="polite"
          action={{ label: 'Play video', onPress: onPlay }}
        />
      );
    case 'unavailable':
      return (
        <UnavailableMediaPanel
          label="Video"
          message="Video isn’t available yet"
        />
      );
  }
}

function AudioPlaybackControls({
  episode,
  episodes,
  player,
  onEpisodeChanged,
  section,
  sectionLanguage,
}: EpisodeMediaPlayerProps & {
  section: PodcastSectionKind;
  sectionLanguage: string | null;
}) {
  const isCurrentEpisode =
    player.nowPlaying?.localizationId === episode.localizationId;
  const isCurrent =
    isCurrentEpisode &&
    player.currentSection === section &&
    (section !== 'classroom' ||
      player.currentSectionLanguage === sectionLanguage);
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
  onVideoClockChange,
}: EpisodeMediaPlayerProps) {
  const { t } = useContentLanguage();
  const [selectedTab, setSelectedTab] = useState<EpisodeMediaTab>('story');
  const [selectedClassroomLanguage, setSelectedClassroomLanguage] = useState<
    string | null
  >(null);
  const [videoSession, setVideoSession] = useState<VideoHandoffSession | null>(
    null,
  );
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
  const classroomSections = buildPlaybackSections(episode).filter(
    (section) => section.kind === 'classroom',
  );
  const activeClassroomLanguage = resolveActiveClassroomLanguage({
    classroomSections,
    playerLanguage:
      isCurrentAudio && player.currentSection === 'classroom'
        ? player.currentSectionLanguage
        : null,
    selectedLanguage: selectedClassroomLanguage,
  });
  const videoPanelState = episodeVideoPanelState(episode);
  const videoProgress = episodeVideoProgressView(episode);
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

  useEffect(() => () => onVideoClockChange?.(null), [onVideoClockChange]);

  const showVideo = () => {
    setSelectedTab('video');
    if (episode.video === null || videoSession !== null) return;
    const nextVideoSession = handoffAudioToVideo({
      audioTimeSeconds: audioHandoffTime,
      videoDurationSeconds: episode.video.durationSeconds,
      playbackRate: player.speed,
      shouldPlay: player.isPlaying,
      pauseAudio: () => player.pause(),
    });
    videoTimeRef.current = nextVideoSession.initialTimeSeconds;
    videoDurationRef.current = episode.video.durationSeconds;
    videoPlayingRef.current = nextVideoSession.shouldPlay;
    videoRateRef.current = nextVideoSession.playbackRate;
    videoFailureHandledRef.current = false;
    onVideoClockChange?.({
      currentTimeSeconds: nextVideoSession.initialTimeSeconds,
      durationSeconds: episode.video.durationSeconds,
    });
    setVideoSession(nextVideoSession);
  };

  const continueWithAudio = useCallback(
    (
      section: PodcastSectionKind = 'main',
      shouldPlay = videoPlayingRef.current,
      languageCode?: string | null,
    ) => {
      const position = clampPodcastPlaybackSeconds(
        videoTimeRef.current,
        videoDurationRef.current,
      );
      persistVideoPosition(position, true);
      player.setSpeed(videoRateRef.current);
      player.playSectionFromQueue(episodes, episode, section, {
        atSeconds: section === 'main' ? position : 0,
        shouldPlay,
        languageCode: languageCode ?? null,
      });
      setSelectedTab(section === 'classroom' ? 'classroom' : 'story');
      onVideoClockChange?.(null);
      setVideoSession(null);
    },
    [episode, episodes, onVideoClockChange, persistVideoPosition, player],
  );

  const selectAudioTab = (
    tab: 'story' | 'classroom',
    languageCode?: string,
  ) => {
    const section: PodcastSectionKind =
      tab === 'classroom' ? 'classroom' : 'main';
    const targetLanguage =
      tab === 'classroom' ? (languageCode ?? activeClassroomLanguage) : null;
    setSelectedTab(tab);
    if (tab === 'classroom' && targetLanguage !== null) {
      setSelectedClassroomLanguage(targetLanguage);
    }
    if (!availability[tab]) return;

    if (videoSession !== null) {
      continueWithAudio(section, undefined, targetLanguage);
      return;
    }
    if (
      isCurrentAudio &&
      player.currentSection === section &&
      (section !== 'classroom' ||
        player.currentSectionLanguage === targetLanguage)
    ) {
      return;
    }
    player.playSectionFromQueue(episodes, episode, section, {
      shouldPlay: player.isPlaying,
      languageCode: targetLanguage,
    });
  };

  const handleVideoTimeUpdate = useCallback(
    (seconds: number, duration: number) => {
      const position = clampPodcastPlaybackSeconds(seconds, duration);
      videoTimeRef.current = position;
      videoDurationRef.current = duration;
      onVideoClockChange?.({
        currentTimeSeconds: position,
        durationSeconds: duration,
      });
      persistVideoPosition(position);
      if (
        duration > 0 &&
        duration - position <= VIDEO_COMPLETION_THRESHOLD_SECONDS
      ) {
        markListened(episode.localizationId, true);
      }
    },
    [
      episode.localizationId,
      markListened,
      onVideoClockChange,
      persistVideoPosition,
    ],
  );

  const handleVideoEnd = useCallback(
    (duration: number) => {
      const finalPosition = finiteSeconds(duration);
      videoTimeRef.current = finalPosition;
      videoDurationRef.current = finalPosition;
      onVideoClockChange?.({
        currentTimeSeconds: finalPosition,
        durationSeconds: finalPosition,
      });
      persistVideoPosition(finalPosition, true);
      markListened(episode.localizationId, true);
    },
    [
      episode.localizationId,
      markListened,
      onVideoClockChange,
      persistVideoPosition,
    ],
  );

  const handleVideoError = useCallback(() => {
    if (videoFailureHandledRef.current) return;
    videoFailureHandledRef.current = true;
    continueWithAudio('main', videoPlayingRef.current);
  }, [continueWithAudio]);

  const video = episode.video;
  let videoTabHint: string;
  switch (videoPanelState) {
    case 'ready':
      videoTabHint = `Continue video from ${formatPodcastClock(audioHandoffTime)}`;
      break;
    case 'generating':
      videoTabHint = 'Video is being generated';
      break;
    case 'failed':
      videoTabHint = 'Video generation failed';
      break;
    case 'unavailable':
      videoTabHint = 'Video isn’t available yet';
      break;
  }

  const renderMediaPanel = () => {
    if (activeTab === 'video') {
      if (video === null || videoSession === null) {
        return (
          <EpisodeVideoStatusPanel
            state={videoPanelState}
            progress={videoProgress}
            onPlay={showVideo}
          />
        );
      }
      return (
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
      );
    }
    if (activeTab === 'classroom' && !availability.classroom) {
      return (
        <UnavailableMediaPanel
          label="Classroom"
          message="Classroom isn’t available for this episode"
        />
      );
    }
    return (
      <View
        nativeID="episode-media-panel"
        role="tabpanel"
        accessibilityLabel={
          activeAudioSection === 'classroom'
            ? 'Classroom player'
            : 'Story player'
        }
      >
        {activeAudioSection === 'classroom' && classroomSections.length > 1 ? (
          <View className="flex-row flex-wrap gap-2 px-5 pt-4">
            {classroomSections.map((section) => {
              const language = section.languageCode;
              if (language === null) return null;
              const isActiveLanguage = language === activeClassroomLanguage;
              return (
                <Tap
                  key={language}
                  accessibilityRole="button"
                  accessibilityLabel={classroomLanguageLabel(language, t)}
                  accessibilityState={{ selected: isActiveLanguage }}
                  onPress={() => selectAudioTab('classroom', language)}
                  className={cn(
                    'rounded-full border px-3 py-1.5',
                    isActiveLanguage
                      ? 'border-[rgba(212,197,163,.5)] bg-[rgba(212,197,163,.18)]'
                      : 'border-line bg-[rgba(255,255,255,.04)]',
                  )}
                >
                  <Text
                    className={cn(
                      'font-sans-semibold text-[12px]',
                      isActiveLanguage ? 'text-accent' : 'text-ink-dim',
                    )}
                  >
                    {classroomLanguageLabel(language, t)}
                  </Text>
                </Tap>
              );
            })}
          </View>
        ) : null}
        <AudioPlaybackControls
          episode={episode}
          episodes={episodes}
          player={player}
          onEpisodeChanged={onEpisodeChanged}
          section={activeAudioSection}
          sectionLanguage={
            activeAudioSection === 'classroom' ? activeClassroomLanguage : null
          }
        />
      </View>
    );
  };

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
              hint={videoTabHint}
              busy={videoPanelState === 'generating'}
              onPress={showVideo}
            />
          </View>
        </View>

        {renderMediaPanel()}
      </View>
    </View>
  );
}
