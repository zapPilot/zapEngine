import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
// jscpd:ignore-start — native and web players intentionally share one contract
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import type { PendingPodcastPlaybackHandoff } from '@/integration/podcastPlayerShared';
import {
  clampPodcastPlaybackSeconds,
  createPodcastPlayerSnapshot,
  finiteSeconds,
  hasNextPodcastEpisode,
  isSamePodcastEpisode,
} from '@/integration/podcastPlayerShared';
import { usePodcastPlayerQueue } from '@/integration/usePodcastPlayerQueue';
// jscpd:ignore-end

export function usePodcastPlayer(): PodcastPlayer {
  const audioPlayer = useAudioPlayer(null, {
    updateInterval: 500,
    preferredForwardBufferDuration: 12,
  });
  const status = useAudioPlayerStatus(audioPlayer);
  const [nowPlaying, setNowPlaying] = useState<PodcastEpisode | null>(null);
  const [speed, setSpeedState] = useState(1);
  const pendingHandoffRef = useRef<PendingPodcastPlaybackHandoff | null>(null);
  const handoffIdRef = useRef(0);
  const [handoffRevision, setHandoffRevision] = useState(0);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const cancelPendingHandoff = useCallback(() => {
    handoffIdRef.current += 1;
    if (pendingHandoffRef.current === null) return;
    pendingHandoffRef.current = null;
    setHandoffRevision((current) => current + 1);
  }, []);

  const pause = useCallback(() => {
    cancelPendingHandoff();
    audioPlayer.pause();
  }, [audioPlayer, cancelPendingHandoff]);

  const toggleCurrentPlayback = useCallback(() => {
    cancelPendingHandoff();
    if (status.playing) {
      audioPlayer.pause();
    } else {
      audioPlayer.play();
    }
  }, [audioPlayer, cancelPendingHandoff, status.playing]);

  const playEpisode = useCallback(
    (episode: PodcastEpisode) => {
      cancelPendingHandoff();
      audioPlayer.replace({ uri: episode.hlsUrl, name: episode.title });
      audioPlayer.setPlaybackRate(speed);
      setNowPlaying(episode);
      audioPlayer.play();
    },
    [audioPlayer, cancelPendingHandoff, speed],
  );

  // jscpd:ignore-start — native and web handoffs enforce the same transition
  const playEpisodeAt = useCallback(
    (episode: PodcastEpisode, seconds: number, shouldPlay: boolean) => {
      audioPlayer.pause();

      const handoffId = handoffIdRef.current + 1;
      handoffIdRef.current = handoffId;
      pendingHandoffRef.current = {
        id: handoffId,
        seconds: finiteSeconds(seconds),
        shouldPlay,
      };

      if (!isSamePodcastEpisode(nowPlaying, episode)) {
        audioPlayer.replace({ uri: episode.hlsUrl, name: episode.title });
        audioPlayer.setPlaybackRate(speed);
        setNowPlaying(episode);
      }

      setHandoffRevision((current) => current + 1);
    },
    [audioPlayer, nowPlaying, speed],
  );
  // jscpd:ignore-end

  const queueState = usePodcastPlayerQueue({
    nowPlaying,
    playEpisode,
    playEpisodeAt,
    toggleCurrentPlayback,
  });

  useEffect(() => {
    const handoff = pendingHandoffRef.current;
    const currentStatus = audioPlayer.currentStatus;
    const duration = finiteSeconds(currentStatus.duration);
    if (handoff === null || !currentStatus.isLoaded || duration <= 0) return;

    pendingHandoffRef.current = null;
    const target = clampPodcastPlaybackSeconds(handoff.seconds, duration);
    void audioPlayer
      .seekTo(target)
      .then(() => {
        if (handoffIdRef.current !== handoff.id) return;
        if (handoff.shouldPlay) {
          audioPlayer.play();
        } else {
          audioPlayer.pause();
        }
      })
      .catch(() => {
        if (handoffIdRef.current === handoff.id) audioPlayer.pause();
      });
  }, [audioPlayer, handoffRevision, status.duration, status.isLoaded]);

  useEffect(
    () => () => {
      handoffIdRef.current += 1;
      pendingHandoffRef.current = null;
    },
    [],
  );

  // Auto-advance to the next queued episode when the current one finishes.
  useEffect(() => {
    if (
      status.didJustFinish &&
      hasNextPodcastEpisode(queueState.queue, queueState.queueIndex)
    ) {
      queueState.skipToNextEpisode();
    }
  }, [status.didJustFinish, queueState]);

  const seek = useCallback(
    (seconds: number) => {
      cancelPendingHandoff();
      const duration = finiteSeconds(status.duration);
      const target =
        duration > 0 ? Math.min(Math.max(0, seconds), duration) : 0;
      void audioPlayer.seekTo(target);
    },
    [audioPlayer, cancelPendingHandoff, status.duration],
  );

  const seekRelative = useCallback(
    (deltaSeconds: number) => {
      seek(finiteSeconds(status.currentTime) + deltaSeconds);
    },
    [seek, status.currentTime],
  );

  const setSpeed = useCallback(
    (nextSpeed: number) => {
      setSpeedState(nextSpeed);
      audioPlayer.setPlaybackRate(nextSpeed);
    },
    [audioPlayer],
  );

  // jscpd:ignore-start — platform snapshots implement the same public contract
  return useMemo(() => {
    // This pure helper only stores callbacks; it cannot invoke a ref-reading
    // playback action while React is rendering.
    // eslint-disable-next-line react-hooks/refs
    return createPodcastPlayerSnapshot({
      nowPlaying,
      isPlaying: status.playing,
      currentTime: status.currentTime,
      duration: status.duration,
      speed,
      queue: queueState.queue,
      queueIndex: queueState.queueIndex,
      pause,
      toggle: queueState.toggle,
      playFromQueue: queueState.playFromQueue,
      playFromQueueAt: queueState.playFromQueueAt,
      seek,
      seekRelative,
      skipToPreviousEpisode: queueState.skipToPreviousEpisode,
      skipToNextEpisode: queueState.skipToNextEpisode,
      setSpeed,
    });
  }, [
    nowPlaying,
    pause,
    queueState,
    seek,
    seekRelative,
    setSpeed,
    speed,
    status.currentTime,
    status.duration,
    status.playing,
  ]);
  // jscpd:ignore-end
}
