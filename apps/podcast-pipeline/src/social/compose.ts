import { youtubeDescriptionCtaFor } from '../brand/cta.js';
import {
  isUsableRednoteTitle,
  readRednoteTitleVariant,
} from '../services/title-variants.js';
import { applyPlatformCta, SOCIAL_PLATFORM_CONFIG } from './platforms.js';
import { rednoteTitleUnits, YOUTUBE_TITLE_MAX_CHARACTERS } from './policy.js';
import type {
  GeneratedSocialCopy,
  SocialEpisode,
  SocialHookType,
  SocialPlatform,
} from './types.js';

/** Only the fields YouTube metadata is assembled from. */
export type SocialComposeEpisode = Pick<
  SocialEpisode,
  'title' | 'summary' | 'description'
> & { languageCode?: SocialEpisode['languageCode']; titleVariants?: unknown };

export interface ComposedSocialContent {
  /** `null` on platforms that have no title field of their own. */
  title: string | null;
  body: string;
  hashtags: string[];
  hookType: SocialHookType;
}

const YOUTUBE_DESCRIPTION_MAX_CHARACTERS = 4500;

/**
 * The single mapping from one generated copy to what a platform actually
 * receives. Publishing, telemetry, and the review preview all read it here, so
 * they cannot disagree about which field carries the hook title or where the
 * CTA goes.
 */
export function composeSocialContent(
  platform: SocialPlatform,
  input: {
    copy: GeneratedSocialCopy;
    episode: SocialComposeEpisode;
    /** Attributed landing URL used only for the final branded publish copy. */
    destinationUrl?: string;
    /**
     * `omit` returns the same mapping before platform branding — what telemetry
     * records as the generated copy.
     */
    cta?: 'apply' | 'omit';
    /** `social_publish_jobs.legacy_title_override`, validated, never re-fitted. */
    titleOverride?: string | null;
  },
): ComposedSocialContent {
  const content = composePlatformContent(platform, input);
  // YouTube's closing line is part of the assembled description, not the short
  // `官網 …` suffix `applyPlatformCta` appends, so it is already final.
  if (platform === 'youtube' || input.cta === 'omit') return content;
  return {
    ...content,
    body: applyPlatformCta(
      platform,
      content.body,
      input.episode.languageCode ?? 'zh-Hant',
      input.destinationUrl,
    ),
  };
}

function composePlatformContent(
  platform: SocialPlatform,
  input: {
    copy: GeneratedSocialCopy;
    episode: SocialComposeEpisode;
    destinationUrl?: string;
    titleOverride?: string | null;
  },
): ComposedSocialContent {
  const title = (platform: 'rednote' | 'youtube') =>
    resolveTransportTitle(input.episode, platform, input.titleOverride).title;
  switch (platform) {
    case 'x': {
      const x = requireCopyBlock(input.copy.x, 'x');
      return {
        title: null,
        body: x.text,
        hashtags: [],
        hookType: x.hookType,
      };
    }
    case 'threads': {
      const threads = requireCopyBlock(input.copy.threads, 'threads');
      return {
        title: null,
        body: threads.text,
        hashtags: [],
        hookType: threads.hookType,
      };
    }
    case 'rednote': {
      const rednote = requireCopyBlock(input.copy.rednote, 'rednote');
      return {
        title: title('rednote'),
        body: rednote.body,
        hashtags: [...rednote.hashtags],
        hookType: rednote.hookType,
      };
    }
    case 'youtube': {
      const youtube = requireCopyBlock(input.copy.youtube, 'youtube');
      return {
        title: title('youtube'),
        body: composeYouTubeDescription(input.episode, input.destinationUrl),
        hashtags: [],
        hookType: youtube.hookType,
      };
    }
    default:
      return assertNever(platform);
  }
}

function requireCopyBlock<T>(block: T | undefined, name: string): T {
  if (block) return block;
  throw new Error(`Generated social copy is missing the ${name} block.`);
}

export type TransportTitle =
  | { title: string; reason: null }
  | { title: null; reason: string };

/**
 * The one decision about what title a platform receives. It never cuts a
 * title: a Rednote title that does not fit the platform's measured budget, a
 * truncated legacy variant, or an over-long YouTube title resolves to `null`
 * with the reason, and the release barrier holds the cohort on it. It never
 * throws either, because telemetry re-composes after transport and a throw
 * there would lose the `social_posts` row of a post that is already live.
 */
export function resolveTransportTitle(
  episode: SocialComposeEpisode,
  platform: 'rednote' | 'youtube',
  override?: string | null,
): TransportTitle {
  if (platform === 'youtube') {
    const title = episode.title.trim();
    const length = Array.from(title).length;
    if (!title) return { title: null, reason: 'YouTube title is empty' };
    return length <= YOUTUBE_TITLE_MAX_CHARACTERS
      ? { title, reason: null }
      : {
          title: null,
          reason: `YouTube title is ${length} characters, over ${YOUTUBE_TITLE_MAX_CHARACTERS}`,
        };
  }
  const forced = override?.trim();
  if (forced) {
    return isUsableRednoteTitle(forced)
      ? { title: forced, reason: null }
      : {
          title: null,
          reason: `Rednote title override measures ${rednoteTitleUnits(forced)} units, over budget`,
        };
  }
  // The Best Title wins whenever it fits; a stored variant only stands in for
  // one that does not.
  const best = episode.title.trim();
  if (best && isUsableRednoteTitle(best)) return { title: best, reason: null };
  const variant = readRednoteTitleVariant(episode.titleVariants);
  if (variant) return { title: variant, reason: null };
  return {
    title: null,
    reason: `Rednote title measures ${rednoteTitleUnits(best)} units and has no valid stored variant`,
  };
}

export function composeYouTubeDescription(
  episode: SocialComposeEpisode,
  destinationUrl?: string,
): string {
  const summary = (episode.description?.trim() || episode.summary.trim()).slice(
    0,
    YOUTUBE_DESCRIPTION_MAX_CHARACTERS,
  );
  // An episode with no summary at all yields an empty description rather than a
  // description that is only a CTA line, so the publisher's fail-closed check
  // still catches it.
  const branded =
    summary && SOCIAL_PLATFORM_CONFIG.youtube.ctaMode === 'brand'
      ? `${summary}\n\n${youtubeDescriptionCtaFor(episode.languageCode ?? 'zh-Hant', destinationUrl)}`
      : summary;
  return branded;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported social platform: ${String(value)}`);
}
