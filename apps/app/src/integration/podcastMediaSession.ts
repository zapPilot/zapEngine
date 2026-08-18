/**
 * Lock-screen / headset media controls — pure logic shared by both players.
 *
 * Native (`podcastPlayer.ts`) and web (`podcastPlayer.web.ts`) reach the same
 * OS surface through different APIs: expo-audio's `setActiveForLockScreen` and
 * the browser's `navigator.mediaSession`. Track navigation is the interesting
 * case — neither platform can advance the queue itself, because the queue lives
 * in JS (`usePodcastPlayerQueue`) and an episode is a *section pair*, not a
 * native playlist. Both platforms therefore hand the command back to JS, and
 * this module holds the parts that must not drift between them.
 */
import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastSectionKind } from '@/integration/podcastSections';

const PODCAST_ARTIST = 'From Fed to Chain';

export type PodcastRemoteCommand = 'nextTrack' | 'previousTrack';

export type PodcastRemoteCommandHandlers = Record<
  PodcastRemoteCommand,
  () => void
>;

/**
 * Seed for the handler ref both players hold. Commands that arrive before the
 * queue is wired have nowhere to go, and dropping them beats crashing inside a
 * media-button handler. Replaced wholesale, never mutated.
 */
export const IDLE_REMOTE_COMMAND_HANDLERS: PodcastRemoteCommandHandlers =
  Object.freeze({
    nextTrack: () => undefined,
    previousTrack: () => undefined,
  });

export interface PodcastMediaMetadata {
  title: string;
  artist: string;
  artworkUrl?: string;
}

export function buildPodcastMediaMetadata(
  episode: PodcastEpisode,
  section: PodcastSectionKind,
  languageCode: string | null = null,
): PodcastMediaMetadata {
  const title =
    section === 'classroom'
      ? languageCode === null
        ? `${episode.title} — Language Classroom`
        : `${episode.title} — Language Classroom (${languageCode.toUpperCase()})`
      : episode.title;
  const artworkUrl = episode.video?.thumbnailUrl;

  return artworkUrl === undefined || artworkUrl === ''
    ? { title, artist: PODCAST_ARTIST }
    : { title, artist: PODCAST_ARTIST, artworkUrl };
}

/**
 * Narrow the payload of the patched expo-audio `lockScreenRemoteCommand` event.
 * It crosses the native bridge untyped, so an unknown command must degrade to
 * "ignore" rather than throw inside a media-button handler.
 */
export function resolvePodcastRemoteCommand(
  payload: unknown,
): PodcastRemoteCommand | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { command } = payload as { command?: unknown };
  return command === 'nextTrack' || command === 'previousTrack'
    ? command
    : null;
}

export interface PodcastMediaSessionHandlers {
  play: () => void;
  pause: () => void;
  seekBackward: () => void;
  seekForward: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
}

/**
 * The subset of `MediaSessionAction` this player drives. Naming the actions
 * keeps the structural match with the DOM `MediaSession` exact, so the browser
 * object can be passed in without a cast.
 */
type PodcastMediaSessionAction =
  | 'play'
  | 'pause'
  | 'seekbackward'
  | 'seekforward'
  | 'nexttrack'
  | 'previoustrack';

interface MediaSessionLike {
  setActionHandler: (
    action: PodcastMediaSessionAction,
    handler: (() => void) | null,
  ) => void;
}

const ACTION_BY_HANDLER: readonly (readonly [
  PodcastMediaSessionAction,
  keyof PodcastMediaSessionHandlers,
])[] = [
  ['play', 'play'],
  ['pause', 'pause'],
  ['seekbackward', 'seekBackward'],
  ['seekforward', 'seekForward'],
  ['nexttrack', 'nextTrack'],
  ['previoustrack', 'previousTrack'],
];

/**
 * Register every media-session action we support, returning a cleanup that
 * clears them. A user agent that does not implement an action throws on
 * `setActionHandler`, so each registration is isolated: an unsupported
 * `nexttrack` must not cost us `play`.
 */
export function registerPodcastMediaSessionHandlers(
  mediaSession: MediaSessionLike,
  handlers: PodcastMediaSessionHandlers,
): () => void {
  const registered: PodcastMediaSessionAction[] = [];

  for (const [action, key] of ACTION_BY_HANDLER) {
    try {
      mediaSession.setActionHandler(action, handlers[key]);
      registered.push(action);
    } catch {
      // Unsupported action for this user agent; the rest still apply.
    }
  }

  return () => {
    for (const action of registered) {
      try {
        mediaSession.setActionHandler(action, null);
      } catch {
        // Nothing to unregister if the UA dropped support mid-session.
      }
    }
  };
}

export interface MediaSessionPositionState {
  duration: number;
  playbackRate: number;
  position: number;
}

/**
 * Build the position state that draws the scrubber on mobile-web lock screens.
 * Returns null when the media has no known duration — the spec rejects a
 * non-finite duration or a position past the end.
 */
export function buildMediaSessionPositionState(
  currentTime: number,
  duration: number,
  speed: number,
): MediaSessionPositionState | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const position = Number.isFinite(currentTime)
    ? Math.min(Math.max(0, currentTime), duration)
    : 0;
  const playbackRate = Number.isFinite(speed) && speed > 0 ? speed : 1;

  return { duration, playbackRate, position };
}
