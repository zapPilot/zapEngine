import { youtubeDescriptionCtaFor } from '../brand/cta.js';
import { applyPlatformCta, SOCIAL_PLATFORM_CONFIG } from './platforms.js';
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
> & { languageCode?: SocialEpisode['languageCode'] };

export interface ComposedSocialContent {
  /** `null` on platforms that have no title field of their own. */
  title: string | null;
  body: string;
  hashtags: string[];
  hookType: SocialHookType;
}

export const YOUTUBE_TITLE_MAX_CHARACTERS = 100;
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
  },
): ComposedSocialContent {
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
        title: input.episode.title,
        body: rednote.body,
        hashtags: [...rednote.hashtags],
        hookType: rednote.hookType,
      };
    }
    case 'youtube': {
      const youtube = requireCopyBlock(input.copy.youtube, 'youtube');
      return {
        title: fitYouTubeTitle(input.episode.title),
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

// YouTube metadata remains episode-derived. The title is the canonical
// episode localization title; social generation only supplies hook metadata.
// Legacy localizations can predate the current title-length contract, so the
// transport projection fits those titles deterministically instead of asking an
// LLM to invent a second platform-specific headline.
function fitYouTubeTitle(title: string): string {
  const normalized = title.trim();
  const characters = Array.from(normalized);
  if (characters.length <= YOUTUBE_TITLE_MAX_CHARACTERS) return normalized;
  return `${characters
    .slice(0, YOUTUBE_TITLE_MAX_CHARACTERS - 1)
    .join('')
    .trimEnd()}…`;
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
