import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import {
  createPodcastPlayerSnapshot,
  finiteSeconds,
  hasNextPodcastEpisode,
} from '@/integration/podcastPlayerShared';
import { usePodcastPlayerQueue } from '@/integration/usePodcastPlayerQueue';

export function usePodcastPlayer(): PodcastPlayer {
  const audioPlayer = useAudioPlayer(null, {
    updateInterval: 500,
    preferredForwardBufferDuration: 12,
  });
  const status = useAudioPlayerStatus(audioPlayer);
  const [nowPlaying, setNowPlaying] = useState<PodcastEpisode | null>(null);
  const [speed, setSpeedState] = useState(1);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const pause = useCallback(() => {
    audioPlayer.pause();
  }, [audioPlayer]);

  const toggleCurrentPlayback = useCallback(() => {
    if (status.playing) {
      audioPlayer.pause();
    } else {
      audioPlayer.play();
    }
  }, [audioPlayer, status.playing]);

  const playEpisode = useCallback(
    (episode: PodcastEpisode) => {
      audioPlayer.replace({ uri: episode.hlsUrl, name: episode.title });
      audioPlayer.setPlaybackRate(speed);
      setNowPlaying(episode);
      audioPlayer.play();
    },
    [audioPlayer, speed],
  );

  const queueState = usePodcastPlayerQueue({
    nowPlaying,
    playEpisode,
    toggleCurrentPlayback,
  });

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
      const duration = finiteSeconds(status.duration);
      const target =
        duration > 0 ? Math.min(Math.max(0, seconds), duration) : 0;
      void audioPlayer.seekTo(target);
    },
    [audioPlayer, status.duration],
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

  return useMemo(
    () =>
      createPodcastPlayerSnapshot({
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
        seek,
        seekRelative,
        skipToPreviousEpisode: queueState.skipToPreviousEpisode,
        skipToNextEpisode: queueState.skipToNextEpisode,
        setSpeed,
      }),
    [
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
    ],
  );
}
