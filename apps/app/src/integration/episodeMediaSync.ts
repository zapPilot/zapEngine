import {
  clampPodcastPlaybackSeconds,
  finiteSeconds,
} from '@/integration/podcastPlayerShared';

export const VIDEO_HANDOFF_SEEK_TOLERANCE_SECONDS = 0.35;

export interface EpisodeMediaClock {
  readonly currentTimeSeconds: number;
  readonly durationSeconds: number;
}

export interface VideoHandoffSession {
  readonly initialTimeSeconds: number;
  readonly playbackRate: number;
  readonly shouldPlay: boolean;
}

export function handoffAudioToVideo({
  audioTimeSeconds,
  videoDurationSeconds,
  playbackRate,
  shouldPlay,
  pauseAudio,
}: {
  audioTimeSeconds: number;
  videoDurationSeconds: number;
  playbackRate: number;
  shouldPlay: boolean;
  pauseAudio: () => void;
}): VideoHandoffSession {
  const initialTimeSeconds = clampPodcastPlaybackSeconds(
    audioTimeSeconds,
    videoDurationSeconds,
  );
  pauseAudio();
  return {
    initialTimeSeconds,
    playbackRate,
    shouldPlay,
  };
}

export function isVideoHandoffSeekConfirmed(
  currentTimeSeconds: number,
  targetTimeSeconds: number,
  toleranceSeconds = VIDEO_HANDOFF_SEEK_TOLERANCE_SECONDS,
): boolean {
  const currentTime = finiteSeconds(currentTimeSeconds);
  const targetTime = finiteSeconds(targetTimeSeconds);
  const tolerance = finiteSeconds(toleranceSeconds);
  return Math.abs(currentTime - targetTime) <= tolerance;
}

export function resolveActiveMediaClock({
  videoClock,
  isCurrentAudio,
  audioCurrentTimeSeconds,
  audioDurationSeconds,
}: {
  videoClock: EpisodeMediaClock | null;
  isCurrentAudio: boolean;
  audioCurrentTimeSeconds: number;
  audioDurationSeconds: number;
}): EpisodeMediaClock | null {
  if (videoClock !== null) {
    const durationSeconds = finiteSeconds(videoClock.durationSeconds);
    return {
      currentTimeSeconds: clampPodcastPlaybackSeconds(
        videoClock.currentTimeSeconds,
        durationSeconds,
      ),
      durationSeconds,
    };
  }
  if (!isCurrentAudio) return null;

  const durationSeconds = finiteSeconds(audioDurationSeconds);
  return {
    currentTimeSeconds: clampPodcastPlaybackSeconds(
      audioCurrentTimeSeconds,
      durationSeconds,
    ),
    durationSeconds,
  };
}
