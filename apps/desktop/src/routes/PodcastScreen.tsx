/** Podcast — From Fed to Chain daily feed with an inline HLS audio player. */
import Hls from 'hls.js';
import { Headphones, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import {
  type PodcastEpisode,
  usePodcastEpisodes,
} from '@/integration/podcastFeed';
import { cn } from '@/lib/cn';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function formatEpisodeDate(createdAt: string): string {
  const parsed = new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? '' : dateFormatter.format(parsed);
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

interface PodcastPlayer {
  nowPlaying: PodcastEpisode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  toggle: (episode: PodcastEpisode) => void;
  seek: (seconds: number) => void;
}

function usePodcastPlayer(): PodcastPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
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

      // WKWebView (the packaged Tauri shell) plays HLS natively; hls.js covers
      // Chromium browsers used against the dev server.
      if (audio.canPlayType('application/vnd.apple.mpegurl') !== '') {
        audio.src = episode.hlsUrl;
      } else if (Hls.isSupported()) {
        const hls = new Hls();
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

function EpisodeBadge({ active }: { active: boolean }) {
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
      style={
        active
          ? {
              background: 'linear-gradient(140deg,#2b2820,#141416)',
              border: '1px solid rgba(212,197,163,.3)',
            }
          : {
              background: '#18181b',
              border: '1px solid rgba(255,255,255,.08)',
            }
      }
      aria-hidden="true"
    >
      <Headphones
        size={18}
        strokeWidth={1.8}
        color={active ? '#d4c5a3' : '#a1a1aa'}
      />
    </span>
  );
}

function EpisodeRow({
  episode,
  first,
  active,
  playing,
  onToggle,
}: {
  episode: PodcastEpisode;
  first: boolean;
  active: boolean;
  playing: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn('flex gap-3 py-[13px]', !first && 'border-t border-line')}
    >
      <EpisodeBadge active={active} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'truncate text-[14px] font-semibold',
              active ? 'text-accent' : 'text-ink',
            )}
          >
            {episode.title}
          </span>
          <button
            type="button"
            onClick={onToggle}
            aria-label={
              playing ? `Pause ${episode.title}` : `Play ${episode.title}`
            }
            className="zp-tap grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{
              background: active
                ? 'rgba(212,197,163,.16)'
                : 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            {playing ? (
              <Pause size={14} strokeWidth={2} color="#d4c5a3" />
            ) : (
              <Play size={14} strokeWidth={2} color="#cfcabb" />
            )}
          </button>
        </div>
        <div className="mt-[5px] flex items-center gap-2">
          <span className="font-mono text-[10px]" style={{ color: '#52525b' }}>
            {formatEpisodeDate(episode.createdAt)}
          </span>
          {episode.listened ? (
            <span
              className="font-mono text-[9px] tracking-[.1em]"
              style={{ color: '#6f6a5f' }}
            >
              LISTENED
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EpisodeListSkeleton() {
  return (
    <section aria-label="Loading podcast episodes" role="status">
      <div className="px-5">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className={cn(
              'flex gap-3 py-[13px]',
              item !== 0 && 'border-t border-line',
            )}
          >
            <SkeletonBlock className="h-10 w-10 rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <SkeletonBlock className="h-4 w-44" />
                <SkeletonBlock className="h-8 w-8 rounded-full" />
              </div>
              <SkeletonBlock className="mt-[9px] h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading podcast episodes…</span>
    </section>
  );
}

function NowPlayingBar({ player }: { player: PodcastPlayer }) {
  if (player.nowPlaying === null) return null;

  return (
    <div
      className="sticky bottom-0 border-t border-line px-5 pb-3 pt-[10px]"
      style={{ background: 'rgba(10,10,10,.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => player.toggle(player.nowPlaying as PodcastEpisode)}
          aria-label={player.isPlaying ? 'Pause' : 'Play'}
          className="zp-tap grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{
            background: 'rgba(212,197,163,.16)',
            border: '1px solid rgba(212,197,163,.3)',
          }}
        >
          {player.isPlaying ? (
            <Pause size={15} strokeWidth={2} color="#d4c5a3" />
          ) : (
            <Play size={15} strokeWidth={2} color="#d4c5a3" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-ink">
            {player.nowPlaying.title}
          </div>
          <div className="mt-[6px] flex items-center gap-2">
            <span
              className="font-mono text-[9px] tabular-nums"
              style={{ color: '#6f6a5f' }}
            >
              {formatClock(player.currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={player.duration > 0 ? Math.floor(player.duration) : 0}
              value={Math.min(
                Math.floor(player.currentTime),
                player.duration > 0 ? Math.floor(player.duration) : 0,
              )}
              onChange={(event) => player.seek(Number(event.target.value))}
              aria-label="Seek"
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
              style={{
                accentColor: '#d4c5a3',
                background: 'rgba(255,255,255,.1)',
              }}
            />
            <span
              className="font-mono text-[9px] tabular-nums"
              style={{ color: '#6f6a5f' }}
            >
              {formatClock(player.duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PodcastScreen() {
  const { data, isLoading, isError } = usePodcastEpisodes();
  const player = usePodcastPlayer();
  const episodes = data ?? [];

  return (
    <div className="flex min-h-full flex-col" data-screen="podcast">
      <ScreenHeader title="Podcast" />

      <div
        className="px-5 pt-[18px] font-mono text-[9.5px] tracking-[.12em]"
        style={{ color: '#6f6a5f' }}
      >
        FROM FED TO CHAIN · DAILY EPISODES
      </div>

      <div className="flex-1">
        {isLoading ? (
          <EpisodeListSkeleton />
        ) : (
          <div className="px-5">
            {episodes.map((episode, index) => (
              <EpisodeRow
                key={episode.localizationId}
                episode={episode}
                first={index === 0}
                active={player.nowPlaying?.id === episode.id}
                playing={
                  player.nowPlaying?.id === episode.id && player.isPlaying
                }
                onToggle={() => player.toggle(episode)}
              />
            ))}
          </div>
        )}

        {!isLoading && episodes.length === 0 ? (
          <div
            className="px-5 pt-[18px] text-[12px]"
            style={{ color: '#6f6a5f' }}
          >
            {isError
              ? 'The podcast feed is unavailable right now.'
              : 'No episodes published yet.'}
          </div>
        ) : null}
      </div>

      <NowPlayingBar player={player} />
    </div>
  );
}
