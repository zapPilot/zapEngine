import { YOUTUBE_DESCRIPTION_CTA } from '../brand/cta.js';
import { applyPlatformCta, SOCIAL_PLATFORM_CONFIG } from './platforms.js';
import type {
  GeneratedSocialCopy,
  SocialEpisode,
  SocialPlatform,
} from './types.js';

/** Only the fields YouTube metadata is assembled from. */
export type SocialComposeEpisode = Pick<
  SocialEpisode,
  'title' | 'summary' | 'description'
>;

export interface ComposedSocialContent {
  /** `null` on platforms that have no title field of their own. */
  title: string | null;
  body: string;
  hashtags: string[];
}

const YOUTUBE_TITLE_MAX_CHARACTERS = 100;
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
  return { ...content, body: applyPlatformCta(platform, content.body) };
}

function composePlatformContent(
  platform: SocialPlatform,
  input: { copy: GeneratedSocialCopy; episode: SocialComposeEpisode },
): ComposedSocialContent {
  switch (platform) {
    case 'x':
    case 'threads':
      // No title field on either platform; Threads deliberately reuses the X
      // wording rather than asking the model for a third variant.
      return { title: null, body: input.copy.x.text, hashtags: [] };
    case 'rednote':
      return {
        title: input.copy.rednote.title,
        body: input.copy.rednote.body,
        hashtags: [...input.copy.rednote.hashtags],
      };
    case 'youtube':
      return composeYouTubeContent(input.episode);
    default:
      return assertNever(platform);
  }
}

// YouTube copy is assembled from the episode rather than written by the model:
// the title is the episode title and the description is its own summary, so
// there is no separate pre-branding version of it to record.
function composeYouTubeContent(
  episode: SocialComposeEpisode,
): ComposedSocialContent {
  const title = Array.from(episode.title.trim())
    .slice(0, YOUTUBE_TITLE_MAX_CHARACTERS)
    .join('');
  const summary = (episode.description?.trim() || episode.summary.trim()).slice(
    0,
    YOUTUBE_DESCRIPTION_MAX_CHARACTERS,
  );
  // An episode with no summary at all yields an empty description rather than a
  // description that is only a CTA line, so the publisher's fail-closed check
  // still catches it.
  const branded =
    summary && SOCIAL_PLATFORM_CONFIG.youtube.ctaMode === 'brand'
      ? `${summary}\n\n${YOUTUBE_DESCRIPTION_CTA}`
      : summary;
  return { title, body: branded, hashtags: [] };
}

function assertNever(value: never): never {
  throw new Error(`Unsupported social platform: ${String(value)}`);
}
