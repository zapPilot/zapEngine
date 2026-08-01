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

function finiteSeconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

function clampSeconds(seconds: number, duration: number): number {
  const finite = finiteSeconds(seconds);
  const finiteDuration = finiteSeconds(duration);
  return finiteDuration > 0 ? Math.min(finite, finiteDuration) : finite;
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
  const initialTimeSeconds = clampSeconds(
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
      currentTimeSeconds: clampSeconds(
        videoClock.currentTimeSeconds,
        durationSeconds,
      ),
      durationSeconds,
    };
  }
  if (!isCurrentAudio) return null;

  const durationSeconds = finiteSeconds(audioDurationSeconds);
  return {
    currentTimeSeconds: clampSeconds(audioCurrentTimeSeconds, durationSeconds),
    durationSeconds,
  };
}
