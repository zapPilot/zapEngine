import HLS from 'hls.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastRemoteCommandHandlers } from '@/integration/podcastMediaSession';
import {
  buildMediaSessionPositionState,
  buildPodcastMediaMetadata,
  IDLE_REMOTE_COMMAND_HANDLERS,
  registerPodcastMediaSessionHandlers,
} from '@/integration/podcastMediaSession';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import type { PendingPodcastPlaybackHandoff } from '@/integration/podcastPlayerShared';
import {
  clampPodcastPlaybackSeconds,
  finiteSeconds,
  hasNextPodcastEpisode,
  hasPreviousPodcastEpisode,
  isSamePodcastEpisode,
} from '@/integration/podcastPlayerShared';
import type {
  PodcastPlaybackSection,
  PodcastSectionKind,
} from '@/integration/podcastSections';
import {
  buildPlaybackSections,
  findPlaybackSection,
  resolveFinishedPlayback,
  speedForSection,
} from '@/integration/podcastSections';
import { usePodcastPlayerQueue } from '@/integration/usePodcastPlayerQueue';
import { usePodcastSpeedPreferences } from '@/hooks/usePodcastSpeedPreferences';

function toggleAudioElement(audio: HTMLAudioElement): void {
  if (audio.paused) {
    void audio.play();
  } else {
    audio.pause();
  }
}

export function usePodcastPlayer(): PodcastPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<HLS | null>(null);
  const onEndedRef = useRef<() => void>(() => undefined);
  const remoteCommandRef = useRef<PodcastRemoteCommandHandlers>(
    IDLE_REMOTE_COMMAND_HANDLERS,
  );
  const pendingHandoffRef = useRef<PendingPodcastPlaybackHandoff | null>(null);
  const handoffIdRef = useRef(0);
  // jscpd:ignore-start — native and web players are intentional twins that
  // implement one shared PodcastPlayer contract over different media APIs.
  const [nowPlaying, setNowPlaying] = useState<PodcastEpisode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const { preferences: speedPreferences, setSpeedForSection } =
    usePodcastSpeedPreferences();
  const [activeSection, setActiveSection] =
    useState<PodcastPlaybackSection | null>(null);

  // A section is the (kind, languageCode) pair, so one state slice holds both;
  // no active section means idle playback, which reads as the main section.
  const currentSection = activeSection?.kind ?? 'main';
  const currentSectionLanguage = activeSection?.languageCode ?? null;

  const sections = useMemo(
    () => (nowPlaying === null ? [] : buildPlaybackSections(nowPlaying)),
    [nowPlaying],
  );

  const cancelPendingHandoff = useCallback(() => {
    handoffIdRef.current += 1;
    pendingHandoffRef.current = null;
  }, []);

  const completePendingHandoff = useCallback(() => {
    const audio = audioRef.current;
    const handoff = pendingHandoffRef.current;
    if (audio === null || handoff === null) return;

    const mediaDuration = finiteSeconds(audio.duration);
    if (
      audio.readyState < HTMLMediaElement.HAVE_METADATA ||
      mediaDuration <= 0
    ) {
      return;
    }

    pendingHandoffRef.current = null;
    audio.currentTime = clampPodcastPlaybackSeconds(
      handoff.seconds,
      mediaDuration,
    );
    if (handoffIdRef.current !== handoff.id) return;
    if (handoff.shouldPlay) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      completePendingHandoff();
    };
    const onLoadedMetadata = () => completePendingHandoff();
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      onEndedRef.current();
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      audio.pause();
      audio.removeAttribute('src');
      audioRef.current = null;
      handoffIdRef.current += 1;
      pendingHandoffRef.current = null;
    };
  }, [completePendingHandoff]);

  // Media Session API: lock-screen / notification controls for mobile web.
  // Handlers read the audio element and the queue lazily through refs, so they
  // register once and survive queue changes.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    return registerPodcastMediaSessionHandlers(navigator.mediaSession, {
      play: () => {
        void audioRef.current?.play();
      },
      pause: () => {
        audioRef.current?.pause();
      },
      seekBackward: () => {
        const audio = audioRef.current;
        if (audio !== null) {
          audio.currentTime = Math.max(0, audio.currentTime - 15);
        }
      },
      seekForward: () => {
        const audio = audioRef.current;
        if (audio !== null && audio.duration > 0) {
          audio.currentTime = Math.min(audio.duration, audio.currentTime + 30);
        }
      },
      nextTrack: () => remoteCommandRef.current.nextTrack(),
      previousTrack: () => remoteCommandRef.current.previousTrack(),
    });
  }, []);

  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      typeof MediaMetadata === 'undefined'
    ) {
      return;
    }
    if (nowPlaying === null) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const metadata = buildPodcastMediaMetadata(
      nowPlaying,
      currentSection,
      currentSectionLanguage,
    );
    navigator.mediaSession.metadata = new MediaMetadata({
      title: metadata.title,
      artist: metadata.artist,
      artwork:
        metadata.artworkUrl === undefined ? [] : [{ src: metadata.artworkUrl }],
    });
  }, [nowPlaying, currentSection, currentSectionLanguage]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  const replaceSource = useCallback(
    (audio: HTMLAudioElement, hlsUrl: string): boolean => {
      hlsRef.current?.destroy();
      hlsRef.current = null;

      // hls.js documents Hls.isSupported() as the feature gate for MSE playback.
      // eslint-disable-next-line import/no-named-as-default-member
      const canUseHls = HLS.isSupported();

      if (
        audio.canPlayType('application/vnd.apple.mpegurl') === '' &&
        !canUseHls
      ) {
        return false;
      }

      if (audio.canPlayType('application/vnd.apple.mpegurl') !== '') {
        audio.src = hlsUrl;
      } else {
        const hls = new HLS();
        hls.loadSource(hlsUrl);
        hls.attachMedia(audio);
        hlsRef.current = hls;
      }

      setCurrentTime(0);
      setDuration(0);
      return true;
    },
    [],
  );

  const playEpisode = useCallback(
    (episode: PodcastEpisode) => {
      const audio = audioRef.current;
      if (audio === null) return;

      cancelPendingHandoff();
      if (!replaceSource(audio, episode.hlsUrl)) return;
      setNowPlaying(episode);
      setActiveSection(null);
      audio.playbackRate = speedForSection(speedPreferences, 'main');
      void audio.play();
    },
    [cancelPendingHandoff, replaceSource, speedPreferences],
  );

  const playEpisodeSection = useCallback(
    (
      episode: PodcastEpisode,
      section: PodcastPlaybackSection,
      atSeconds = 0,
      shouldPlay = true,
    ) => {
      const audio = audioRef.current;
      if (audio === null) return;

      cancelPendingHandoff();
      audio.pause();
      const startAt = finiteSeconds(atSeconds);
      if (startAt > 0) {
        const handoffId = handoffIdRef.current + 1;
        handoffIdRef.current = handoffId;
        pendingHandoffRef.current = {
          id: handoffId,
          seconds: startAt,
          shouldPlay,
        };
      }

      if (!replaceSource(audio, section.hlsUrl)) {
        pendingHandoffRef.current = null;
        return;
      }
      setNowPlaying(episode);
      setActiveSection(section);
      audio.playbackRate = speedForSection(speedPreferences, section.kind);
      if (startAt === 0 && shouldPlay) void audio.play();
    },
    [cancelPendingHandoff, replaceSource, speedPreferences],
  );

  // Swap the loaded source to a section of the current episode (main or
  // classroom) and apply that section's independent playback speed.
  const playSection = useCallback(
    (section: PodcastPlaybackSection, atSeconds = 0, shouldPlay = true) => {
      if (nowPlaying === null) return;
      playEpisodeSection(nowPlaying, section, atSeconds, shouldPlay);
    },
    [nowPlaying, playEpisodeSection],
  );

  const playEpisodeAt = useCallback(
    (episode: PodcastEpisode, seconds: number, shouldPlay: boolean) => {
      const audio = audioRef.current;
      if (audio === null) return;

      audio.pause();
      const handoffId = handoffIdRef.current + 1;
      handoffIdRef.current = handoffId;
      pendingHandoffRef.current = {
        id: handoffId,
        seconds: finiteSeconds(seconds),
        shouldPlay,
      };

      if (!isSamePodcastEpisode(nowPlaying, episode)) {
        if (!replaceSource(audio, episode.hlsUrl)) {
          pendingHandoffRef.current = null;
          return;
        }
        setNowPlaying(episode);
        setActiveSection(null);
        audio.playbackRate = speedForSection(speedPreferences, 'main');
        return;
      }

      completePendingHandoff();
    },
    [completePendingHandoff, nowPlaying, replaceSource, speedPreferences],
  );

  const toggleCurrentPlayback = useCallback(() => {
    cancelPendingHandoff();
    const audio = audioRef.current;
    if (audio !== null) toggleAudioElement(audio);
  }, [cancelPendingHandoff]);

  const queueState = usePodcastPlayerQueue({
    nowPlaying,
    playEpisode,
    playEpisodeAt,
    playEpisodeSection,
    toggleCurrentPlayback,
  });

  // When the current source ends, play the classroom section before advancing
  // to the next episode (section advance precedes episode advance), so a "play
  // unheard" queue plays through without skipping the classroom section. The
  // 'ended' event is edge-triggered, so no dedupe latch is needed here.
  useEffect(() => {
    remoteCommandRef.current = {
      nextTrack: queueState.skipToNextEpisode,
      previousTrack: queueState.skipToPreviousEpisode,
    };
  }, [queueState]);

  useEffect(() => {
    onEndedRef.current = () => {
      const action = resolveFinishedPlayback({
        sections,
        currentSection,
        currentSectionLanguage,
        queue: queueState.queue,
        queueIndex: queueState.queueIndex,
      });
      if (action.type === 'playSection') {
        playSection(action.section);
      } else if (action.type === 'nextEpisode') {
        queueState.skipToNextEpisode();
      }
    };
  }, [
    queueState,
    sections,
    currentSection,
    currentSectionLanguage,
    playSection,
  ]);

  const seek = useCallback(
    (seconds: number) => {
      cancelPendingHandoff();
      const audio = audioRef.current;
      if (audio === null) return;
      const target =
        audio.duration > 0
          ? Math.min(Math.max(0, seconds), audio.duration)
          : Math.max(0, seconds);
      audio.currentTime = target;
    },
    [cancelPendingHandoff],
  );

  const seekRelative = useCallback(
    (deltaSeconds: number) => {
      seek(currentTime + deltaSeconds);
    },
    [currentTime, seek],
  );

  // Setting speed writes only the CURRENT section's preference; classroom and
  // main speeds stay independent.
  const setSpeed = useCallback(
    (nextSpeed: number) => {
      const appliedSpeed = setSpeedForSection(currentSection, nextSpeed);
      const audio = audioRef.current;
      if (audio !== null) {
        audio.playbackRate = appliedSpeed;
      }
    },
    [currentSection, setSpeedForSection],
  );

  const skipToSection = useCallback(
    (kind: PodcastSectionKind, atSeconds = 0, languageCode?: string | null) => {
      const target = findPlaybackSection(sections, kind, languageCode);
      if (target === null) return;
      playSection(target, atSeconds, true);
    },
    [playSection, sections],
  );

  const speed = speedForSection(speedPreferences, currentSection);

  useEffect(() => {
    const audio = audioRef.current;
    if (nowPlaying !== null && audio !== null) {
      audio.playbackRate = speed;
    }
  }, [nowPlaying, speed]);

  // Position state is what draws the scrubber and elapsed time on a mobile-web
  // lock screen. The user agent advances the position itself from `playbackRate`,
  // so this only has to run when the timeline jumps or changes shape — pushing it
  // on every `timeupdate` would be several needless calls per second.
  useEffect(() => {
    const audio = audioRef.current;
    if (
      audio === null ||
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator)
    ) {
      return;
    }

    const { mediaSession } = navigator;
    const syncPositionState = () => {
      const state = buildMediaSessionPositionState(
        audio.currentTime,
        audio.duration,
        audio.playbackRate,
      );
      mediaSession.setPositionState(state ?? undefined);
    };

    syncPositionState();
    audio.addEventListener('seeked', syncPositionState);
    return () => audio.removeEventListener('seeked', syncPositionState);
  }, [duration, isPlaying, speed]);

  const pause = useCallback(() => {
    cancelPendingHandoff();
    audioRef.current?.pause();
  }, [cancelPendingHandoff]);

  return useMemo(
    () => ({
      nowPlaying,
      isPlaying,
      currentTime: finiteSeconds(currentTime),
      duration: finiteSeconds(duration),
      speed,
      sections,
      currentSection,
      currentSectionLanguage,
      queue: queueState.queue,
      queueIndex: queueState.queueIndex,
      hasPreviousEpisode: hasPreviousPodcastEpisode(
        queueState.queue,
        queueState.queueIndex,
      ),
      hasNextEpisode: hasNextPodcastEpisode(
        queueState.queue,
        queueState.queueIndex,
      ),
      pause,
      toggle: queueState.toggle,
      playFromQueue: queueState.playFromQueue,
      playFromQueueAt: queueState.playFromQueueAt,
      playSectionFromQueue: queueState.playSectionFromQueue,
      seek,
      seekRelative,
      skipToPreviousEpisode: queueState.skipToPreviousEpisode,
      skipToNextEpisode: queueState.skipToNextEpisode,
      skipToSection,
      setSpeed,
    }),
    [
      currentTime,
      duration,
      isPlaying,
      queueState,
      nowPlaying,
      pause,
      seek,
      seekRelative,
      setSpeed,
      speed,
      sections,
      currentSection,
      currentSectionLanguage,
      skipToSection,
    ],
  );
  // jscpd:ignore-end
}
