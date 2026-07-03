import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';

import type { PodcastEpisode } from '@/integration/podcastFeed';

export interface PodcastPlayer {
  nowPlaying: PodcastEpisode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  toggle: (episode: PodcastEpisode) => void;
  seek: (seconds: number) => void;
}

function finiteSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function usePodcastPlayer(): PodcastPlayer {
  const audioPlayer = useAudioPlayer(null, {
    updateInterval: 500,
    preferredForwardBufferDuration: 12,
  });
  const status = useAudioPlayerStatus(audioPlayer);
  const [nowPlaying, setNowPlaying] = useState<PodcastEpisode | null>(null);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const toggle = useCallback(
    (episode: PodcastEpisode) => {
      if (nowPlaying?.id === episode.id) {
        if (status.playing) {
          audioPlayer.pause();
        } else {
          audioPlayer.play();
        }
        return;
      }

      audioPlayer.replace({ uri: episode.hlsUrl, name: episode.title });
      setNowPlaying(episode);
      audioPlayer.play();
    },
    [audioPlayer, nowPlaying?.id, status.playing],
  );

  const seek = useCallback(
    (seconds: number) => {
      const duration = finiteSeconds(status.duration);
      const target =
        duration > 0 ? Math.min(Math.max(0, seconds), duration) : 0;
      void audioPlayer.seekTo(target);
    },
    [audioPlayer, status.duration],
  );

  return {
    nowPlaying,
    isPlaying: status.playing,
    currentTime: finiteSeconds(status.currentTime),
    duration: finiteSeconds(status.duration),
    toggle,
    seek,
  };
}
