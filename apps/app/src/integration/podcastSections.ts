/**
 * Language classroom (語言小教室) sectioned playback — pure logic.
 *
 * A podcast episode localization can carry two separate HLS audio artifacts:
 * the main narration (`episode.hlsUrl`) and a language classroom track
 * (`classroomHlsUrl`). They are played as two sequential *sections* of one
 * logical episode, with independent per-section playback speed (classroom
 * defaults to 1.0x). The pipeline never concatenates them (see
 * apps/podcast-pipeline/CLAUDE.md "Audio section invariant").
 *
 * This module holds the platform-agnostic decision logic so the native
 * (`podcastPlayer.ts`) and web (`podcastPlayer.web.ts`) hooks cannot diverge on
 * the transition semantics. Keeping it pure also lets the regression tests run
 * without a player mock — the historical bug (classroom skipped when the screen
 * is off) reduces to a single tested function, `resolveFinishedPlayback`.
 */
import type { PodcastEpisode } from '@/integration/podcastFeed';
import { hasNextPodcastEpisode } from '@/integration/podcastPlayerShared';

export type PodcastSectionKind = 'main' | 'classroom';

export interface PodcastPlaybackSection {
  kind: PodcastSectionKind;
  hlsUrl: string;
}

type EpisodeSectionInput = Pick<
  PodcastEpisode,
  'hlsUrl' | 'languageCode' | 'audioTracks'
>;

function isNonBlank(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Resolve the classroom artifact for an episode. The strongest signal is the
 * audio track whose main `hlsUrl` matches the episode's; otherwise fall back to
 * the track matching the episode `languageCode`, then the first track. Returns
 * null when no non-blank classroom URL is available.
 */
export function classroomHlsUrlFor(
  episode: EpisodeSectionInput,
): string | null {
  const tracks = episode.audioTracks ?? [];
  const byHls = tracks.find(
    (track) => isNonBlank(track.hlsUrl) && track.hlsUrl === episode.hlsUrl,
  );
  const byLanguage = tracks.find(
    (track) => track.languageCode === episode.languageCode,
  );
  const track = byHls ?? byLanguage ?? tracks[0];
  return isNonBlank(track?.classroomHlsUrl) ? track!.classroomHlsUrl : null;
}

/**
 * Build the ordered playback sections for an episode: always `[main]`, plus
 * `classroom` when a classroom artifact exists. Never returns an empty array.
 */
export function buildPlaybackSections(
  episode: EpisodeSectionInput,
): PodcastPlaybackSection[] {
  const sections: PodcastPlaybackSection[] = [
    { kind: 'main', hlsUrl: episode.hlsUrl },
  ];
  const classroomHlsUrl = classroomHlsUrlFor(episode);
  if (classroomHlsUrl !== null) {
    sections.push({ kind: 'classroom', hlsUrl: classroomHlsUrl });
  }
  return sections;
}

export function nextPlaybackSection(
  sections: readonly PodcastPlaybackSection[],
  current: PodcastSectionKind,
): PodcastPlaybackSection | null {
  const index = sections.findIndex((section) => section.kind === current);
  if (index < 0) return null;
  return sections[index + 1] ?? null;
}

export type FinishedPlaybackAction =
  | { type: 'playSection'; section: PodcastPlaybackSection }
  | { type: 'nextEpisode' }
  | { type: 'stop' };

/**
 * Decide what to do when the current audio source finishes. Section advance
 * (main -> classroom) STRICTLY precedes episode advance, so the classroom
 * section is never skipped in favour of the next episode. Shared by native and
 * web so both platforms make the identical decision.
 */
export function resolveFinishedPlayback(params: {
  sections: readonly PodcastPlaybackSection[];
  currentSection: PodcastSectionKind;
  queue: readonly PodcastEpisode[];
  queueIndex: number;
}): FinishedPlaybackAction {
  const next = nextPlaybackSection(params.sections, params.currentSection);
  if (next !== null) {
    return { type: 'playSection', section: next };
  }
  if (hasNextPodcastEpisode(params.queue, params.queueIndex)) {
    return { type: 'nextEpisode' };
  }
  return { type: 'stop' };
}

// --- Per-section playback speed preferences -------------------------------

export interface PodcastSpeedPreferences {
  mainSpeed: number;
  classroomSpeed: number;
}

// Classroom defaults to 1.0x: users listen to the foreign-language teaching at
// normal speed even when the main narration is sped up.
export const DEFAULT_PODCAST_SPEED_PREFERENCES: PodcastSpeedPreferences = {
  mainSpeed: 1,
  classroomSpeed: 1,
};

export const PODCAST_SPEED_PREFERENCES_STORAGE_KEY =
  'podcast_speed_preferences';

const MIN_SPEED = 0.5;
const MAX_SPEED = 3;

function normaliseSpeed(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.max(value, MIN_SPEED), MAX_SPEED)
    : 1;
}

export function speedForSection(
  preferences: PodcastSpeedPreferences,
  kind: PodcastSectionKind,
): number {
  return kind === 'classroom'
    ? preferences.classroomSpeed
    : preferences.mainSpeed;
}

export function withSectionSpeed(
  preferences: PodcastSpeedPreferences,
  kind: PodcastSectionKind,
  speed: number,
): PodcastSpeedPreferences {
  const safeSpeed = normaliseSpeed(speed);
  return kind === 'classroom'
    ? { ...preferences, classroomSpeed: safeSpeed }
    : { ...preferences, mainSpeed: safeSpeed };
}

export function parseStoredSpeedPreferences(
  raw: unknown,
): PodcastSpeedPreferences {
  if (typeof raw !== 'object' || raw === null) {
    return { ...DEFAULT_PODCAST_SPEED_PREFERENCES };
  }
  const record = raw as Record<string, unknown>;
  return {
    mainSpeed: normaliseSpeed(record['mainSpeed']),
    classroomSpeed: normaliseSpeed(record['classroomSpeed']),
  };
}
