import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';

export interface PendingPodcastPlaybackHandoff {
  id: number;
  seconds: number;
  shouldPlay: boolean;
}

export interface PodcastFinishGate {
  generation: number;
  armedGeneration: number;
  consumedGeneration: number;
}

export function createPodcastFinishGate(): PodcastFinishGate {
  return {
    generation: 0,
    armedGeneration: -1,
    consumedGeneration: -1,
  };
}

export function beginPodcastPlaybackSource(gate: PodcastFinishGate): void {
  gate.generation += 1;
  gate.armedGeneration = -1;
}

export function shouldConsumePodcastFinish(
  gate: PodcastFinishGate,
  status: { playing: boolean; didJustFinish: boolean },
): boolean {
  // A newly replaced expo-audio source can briefly inherit the previous
  // source's didJustFinish=true snapshot. Only arm a generation after the new
  // source has actually entered playback, and never consume while it is still
  // playing. This makes a stale finish bit harmless even if React never sees
  // the transient false reset between sources.
  if (status.playing) {
    gate.armedGeneration = gate.generation;
    return false;
  }

  if (
    !status.didJustFinish ||
    gate.armedGeneration !== gate.generation ||
    gate.consumedGeneration === gate.generation
  ) {
    return false;
  }

  gate.consumedGeneration = gate.generation;
  return true;
}

export function finiteSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function clampPodcastPlaybackSeconds(
  seconds: number,
  duration: number,
): number {
  const finiteDuration = finiteSeconds(duration);
  const finiteTarget = finiteSeconds(seconds);
  return finiteDuration > 0
    ? Math.min(finiteTarget, finiteDuration)
    : finiteTarget;
}

export function isSamePodcastEpisode(
  first: PodcastEpisode | null,
  second: PodcastEpisode,
): boolean {
  return first?.localizationId === second.localizationId;
}

export function findPodcastQueueIndex(
  episodes: readonly PodcastEpisode[],
  episode: PodcastEpisode,
): number {
  return episodes.findIndex(
    (candidate) => candidate.localizationId === episode.localizationId,
  );
}

export function hasPreviousPodcastEpisode(
  queue: readonly PodcastEpisode[],
  queueIndex: number,
): boolean {
  return queueIndex > 0 && queueIndex < queue.length;
}

export function hasNextPodcastEpisode(
  queue: readonly PodcastEpisode[],
  queueIndex: number,
): boolean {
  return queueIndex >= 0 && queueIndex < queue.length - 1;
}

export type PodcastPlayerSnapshotParams = Omit<
  PodcastPlayer,
  'hasPreviousEpisode' | 'hasNextEpisode'
>;

export function createPodcastPlayerSnapshot({
  nowPlaying,
  isPlaying,
  currentTime,
  duration,
  speed,
  sections,
  currentSection,
  currentSectionLanguage,
  queue,
  queueIndex,
  pause,
  toggle,
  playFromQueue,
  playFromQueueAt,
  playSectionFromQueue,
  seek,
  seekRelative,
  skipToPreviousEpisode,
  skipToNextEpisode,
  skipToSection,
  setSpeed,
}: PodcastPlayerSnapshotParams): PodcastPlayer {
  return {
    nowPlaying,
    isPlaying,
    currentTime: finiteSeconds(currentTime),
    duration: finiteSeconds(duration),
    speed,
    sections,
    currentSection,
    currentSectionLanguage,
    queue,
    queueIndex,
    hasPreviousEpisode: hasPreviousPodcastEpisode(queue, queueIndex),
    hasNextEpisode: hasNextPodcastEpisode(queue, queueIndex),
    pause,
    toggle,
    playFromQueue,
    playFromQueueAt,
    playSectionFromQueue,
    seek,
    seekRelative,
    skipToPreviousEpisode,
    skipToNextEpisode,
    skipToSection,
    setSpeed,
  };
}
