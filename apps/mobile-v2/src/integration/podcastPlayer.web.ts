import HLS from 'hls.js';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';

export function usePodcastPlayer(): PodcastPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<HLS | null>(null);
  const [nowPlaying, setNowPlaying] = useState<PodcastEpisode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () =>
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onPause);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      audio.pause();
      audio.removeAttribute('src');
      audioRef.current = null;
    };
  }, []);

  const toggle = useCallback(
    (episode: PodcastEpisode) => {
      const audio = audioRef.current;
      if (audio === null) return;

      if (nowPlaying?.id === episode.id) {
        if (audio.paused) {
          void audio.play();
        } else {
          audio.pause();
        }
        return;
      }

      hlsRef.current?.destroy();
      hlsRef.current = null;

      // hls.js documents Hls.isSupported() as the feature gate for MSE playback.
      // eslint-disable-next-line import/no-named-as-default-member
      const canUseHls = HLS.isSupported();

      if (audio.canPlayType('application/vnd.apple.mpegurl') !== '') {
        audio.src = episode.hlsUrl;
      } else if (canUseHls) {
        const hls = new HLS();
        hls.loadSource(episode.hlsUrl);
        hls.attachMedia(audio);
        hlsRef.current = hls;
      } else {
        return;
      }

      setNowPlaying(episode);
      setCurrentTime(0);
      setDuration(0);
      void audio.play();
    },
    [nowPlaying],
  );

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio !== null) {
      audio.currentTime = seconds;
    }
  }, []);

  return { nowPlaying, isPlaying, currentTime, duration, toggle, seek };
}
