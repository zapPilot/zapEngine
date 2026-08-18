/**
 * Language classroom (語言小教室) sectioned playback — pure logic.
 *
 * A podcast episode localization can carry N+1 separate HLS audio artifacts:
 * the main narration (`episode.hlsUrl`) and one language classroom track per
 * target language (`audioTracks[].classrooms`), or — for episodes published
 * before per-language classroom audio existed — a single combined classroom
 * track (`classroomHlsUrl`). They are played as sequential *sections* of one
 * logical episode (main, then each classroom language in turn), with
 * independent per-section playback speed (classroom defaults to 1.0x). The
 * pipeline never concatenates classroom audio into main (see
 * apps/podcast-pipeline/CLAUDE.md "Audio section invariant").
 *
 * A section is identified by the pair `(kind, languageCode)`, not `kind`
 * alone: `languageCode` is `null` for `main` and for the legacy combined
 * classroom fallback, and the target language code (e.g. `'ja'`) for each
 * per-language classroom section.
 *
 * This module holds the platform-agnostic decision logic so the native
 * (`podcastPlayer.ts`) and web (`podcastPlayer.web.ts`) hooks cannot diverge on
 * the transition semantics. Keeping it pure also lets the regression tests run
 * without a player mock — the historical bug (classroom skipped when the screen
 * is off) reduces to a single tested function, `resolveFinishedPlayback`.
 */
import type {
  PodcastAudioTrack,
  PodcastClassroomTrack,
  PodcastEpisode,
} from '@/integration/podcastFeed';
import { hasNextPodcastEpisode } from '@/integration/podcastPlayerShared';

export type PodcastSectionKind = 'main' | 'classroom';

export interface PodcastPlaybackSection {
  kind: PodcastSectionKind;
  hlsUrl: string;
  /** Target language of a classroom section, or null for main / the legacy combined track. */
  languageCode: string | null;
}

type EpisodeSectionInput = Pick<
  PodcastEpisode,
  'hlsUrl' | 'languageCode' | 'audioTracks'
>;

function isNonBlank(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * The audio track representing this episode's displayed language. The
 * strongest signal is the track whose main `hlsUrl` matches the episode's;
 * otherwise fall back to the track matching the episode `languageCode`, then
 * the first track.
 */
function selectedAudioTrack(
  episode: EpisodeSectionInput,
): PodcastAudioTrack | undefined {
  const tracks = episode.audioTracks ?? [];
  const byHls = tracks.find(
    (track) => isNonBlank(track.hlsUrl) && track.hlsUrl === episode.hlsUrl,
  );
  const byLanguage = tracks.find(
    (track) => track.languageCode === episode.languageCode,
  );
  return byHls ?? byLanguage ?? tracks[0];
}

function classroomTracksFor(
  episode: EpisodeSectionInput,
): PodcastClassroomTrack[] {
  return selectedAudioTrack(episode)?.classrooms ?? [];
}

/**
 * Resolve the legacy combined classroom artifact for an episode. Returns null
 * when no non-blank classroom URL is available.
 */
function combinedClassroomHlsUrlFor(
  episode: EpisodeSectionInput,
): string | null {
  const track = selectedAudioTrack(episode);
  return isNonBlank(track?.classroomHlsUrl) ? track!.classroomHlsUrl : null;
}

/**
 * Build the ordered playback sections for an episode: always `[main]`, plus
 * one `classroom` section per target language when per-language classroom
 * audio exists, or a single `classroom` section for the legacy combined
 * track. Never returns an empty array.
 */
export function buildPlaybackSections(
  episode: EpisodeSectionInput,
): PodcastPlaybackSection[] {
  const sections: PodcastPlaybackSection[] = [
    { kind: 'main', hlsUrl: episode.hlsUrl, languageCode: null },
  ];

  const classroomTracks = classroomTracksFor(episode);
  if (classroomTracks.length > 0) {
    const seenLanguages = new Set<string>();
    for (const track of classroomTracks) {
      if (!isNonBlank(track.hlsUrl) || seenLanguages.has(track.languageCode)) {
        continue;
      }
      seenLanguages.add(track.languageCode);
      sections.push({
        kind: 'classroom',
        hlsUrl: track.hlsUrl,
        languageCode: track.languageCode,
      });
    }
    return sections;
  }

  const combinedHlsUrl = combinedClassroomHlsUrlFor(episode);
  if (combinedHlsUrl !== null) {
    sections.push({
      kind: 'classroom',
      hlsUrl: combinedHlsUrl,
      languageCode: null,
    });
  }
  return sections;
}

/** Advances from the given `(kind, languageCode)` pair to the next section in order, or null past the end. */
export function nextPlaybackSection(
  sections: readonly PodcastPlaybackSection[],
  currentKind: PodcastSectionKind,
  currentLanguageCode: string | null = null,
): PodcastPlaybackSection | null {
  const index = sections.findIndex(
    (section) =>
      section.kind === currentKind &&
      section.languageCode === currentLanguageCode,
  );
  if (index < 0) return null;
  return sections[index + 1] ?? null;
}

/**
 * Locates a section by kind, preferring an exact `(kind, languageCode)` match
 * when `languageCode` is given, and otherwise falling back to the first
 * section of that kind (e.g. jumping to "the classroom tab" with no specific
 * language selected yet).
 */
export function findPlaybackSection(
  sections: readonly PodcastPlaybackSection[],
  kind: PodcastSectionKind,
  languageCode?: string | null,
): PodcastPlaybackSection | null {
  if (languageCode !== undefined) {
    const exact = sections.find(
      (section) =>
        section.kind === kind && section.languageCode === languageCode,
    );
    if (exact) return exact;
  }
  return sections.find((section) => section.kind === kind) ?? null;
}

export type FinishedPlaybackAction =
  | { type: 'playSection'; section: PodcastPlaybackSection }
  | { type: 'nextEpisode' }
  | { type: 'stop' };

/**
 * Decide what to do when the current audio source finishes. Section advance
 * (main -> classroom(ja) -> classroom(en) -> ...) STRICTLY precedes episode
 * advance, so no classroom language is ever skipped in favour of the next
 * episode. Shared by native and web so both platforms make the identical
 * decision.
 */
export function resolveFinishedPlayback(params: {
  sections: readonly PodcastPlaybackSection[];
  currentSection: PodcastSectionKind;
  currentSectionLanguage?: string | null;
  queue: readonly PodcastEpisode[];
  queueIndex: number;
}): FinishedPlaybackAction {
  const next = nextPlaybackSection(
    params.sections,
    params.currentSection,
    params.currentSectionLanguage ?? null,
  );
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
