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
import { usePodcastPlayerQueue } from '@/integration/usePodcastPlayerQueue';

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
  const [speed, setSpeedState] = useState(1);

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

  const replaceEpisodeSource = useCallback(
    (audio: HTMLAudioElement, episode: PodcastEpisode): boolean => {
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
        audio.src = episode.hlsUrl;
      } else {
        const hls = new HLS();
        hls.loadSource(episode.hlsUrl);
        hls.attachMedia(audio);
        hlsRef.current = hls;
      }

      setNowPlaying(episode);
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
      if (!replaceEpisodeSource(audio, episode)) return;
      audio.playbackRate = speed;
      void audio.play();
    },
    [cancelPendingHandoff, replaceEpisodeSource, speed],
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
        if (!replaceEpisodeSource(audio, episode)) {
          pendingHandoffRef.current = null;
          return;
        }
        audio.playbackRate = speed;
        return;
      }

      completePendingHandoff();
    },
    [completePendingHandoff, nowPlaying, replaceEpisodeSource, speed],
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
    toggleCurrentPlayback,
  });

  // Auto-advance to the next queued episode when the current one ends, so a
  // "play unheard" queue plays through instead of stopping after one episode.
  useEffect(() => {
    onEndedRef.current = () => {
      if (hasNextPodcastEpisode(queueState.queue, queueState.queueIndex)) {
        queueState.skipToNextEpisode();
      }
    };
  }, [queueState]);

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

  const setSpeed = useCallback((nextSpeed: number) => {
    setSpeedState(nextSpeed);
    const audio = audioRef.current;
    if (audio !== null) {
      audio.playbackRate = nextSpeed;
    }
  }, []);

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
      seek,
      seekRelative,
      skipToPreviousEpisode: queueState.skipToPreviousEpisode,
      skipToNextEpisode: queueState.skipToNextEpisode,
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
    ],
  );
}
