import HLS from 'hls.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PodcastEpisode } from '@/integration/podcastFeed';
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
  const pendingHandoffRef = useRef<PendingPodcastPlaybackHandoff | null>(null);
  const handoffIdRef = useRef(0);
  const [nowPlaying, setNowPlaying] = useState<PodcastEpisode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const { preferences: speedPreferences, setSpeedForSection } =
    usePodcastSpeedPreferences();
  const [currentSection, setCurrentSection] =
    useState<PodcastSectionKind>('main');

  // jscpd:ignore-start — native and web players are intentional twins that
  // implement one shared PodcastPlayer contract over different media APIs.
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
  // Handlers read the audio element lazily, so they register once.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }
    const { mediaSession } = navigator;
    mediaSession.setActionHandler('play', () => {
      void audioRef.current?.play();
    });
    mediaSession.setActionHandler('pause', () => {
      audioRef.current?.pause();
    });
    mediaSession.setActionHandler('seekbackward', () => {
      const audio = audioRef.current;
      if (audio !== null) {
        audio.currentTime = Math.max(0, audio.currentTime - 15);
      }
    });
    mediaSession.setActionHandler('seekforward', () => {
      const audio = audioRef.current;
      if (audio !== null && audio.duration > 0) {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 30);
      }
    });
    return () => {
      mediaSession.setActionHandler('play', null);
      mediaSession.setActionHandler('pause', null);
      mediaSession.setActionHandler('seekbackward', null);
      mediaSession.setActionHandler('seekforward', null);
    };
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
    navigator.mediaSession.metadata = new MediaMetadata({
      title:
        currentSection === 'classroom'
          ? `${nowPlaying.title} — Language Classroom`
          : nowPlaying.title,
      artist: 'From Fed to Chain',
    });
  }, [nowPlaying, currentSection]);

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
      setCurrentSection('main');
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
      setCurrentSection(section.kind);
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
        setCurrentSection('main');
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
    onEndedRef.current = () => {
      const action = resolveFinishedPlayback({
        sections,
        currentSection,
        queue: queueState.queue,
        queueIndex: queueState.queueIndex,
      });
      if (action.type === 'playSection') {
        playSection(action.section);
      } else if (action.type === 'nextEpisode') {
        queueState.skipToNextEpisode();
      }
    };
  }, [queueState, sections, currentSection, playSection]);

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
    (kind: PodcastSectionKind, atSeconds = 0) => {
      const target = sections.find((section) => section.kind === kind);
      if (target === undefined) return;
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
      skipToSection,
    ],
  );
  // jscpd:ignore-end
}
