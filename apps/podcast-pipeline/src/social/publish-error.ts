import { errorMessage } from '../lib/errorMessage.js';
import type { SocialLanguageCode, SocialPlatform } from './types.js';

/**
 * Publishing failures name the platform and the step that failed, because the
 * selectors and adapter commands behind each step change without notice and the
 * step name is what makes a repair obvious.
 */
export class SocialPublishError extends Error {
  constructor(
    readonly platform: SocialPlatform,
    readonly step: string,
    cause: unknown,
  ) {
    const detail = errorMessage(cause);
    super(
      `${platform.toUpperCase()}_PUBLISH_FAILED\nStep: ${step}\nCause: ${detail}`,
      { cause },
    );
    this.name = 'SocialPublishError';
  }
}

/**
 * Builds the per-step wrapper a platform publisher uses to label a failure
 * with the step that failed, without repeating the platform name at every
 * call site.
 */
export function publishStep(platform: SocialPlatform) {
  return async function step<T>(
    name: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw new SocialPublishError(platform, name, error);
    }
  };
}

export type SocialReleaseFailurePhase =
  | 'transport'
  | 'state'
  | 'telemetry'
  | 'persist'
  | 'lease';

/**
 * Raised the moment a release cohort's outcome becomes unreadable -- a
 * transport failure, or a publish whose local dedup state or `social_posts`
 * telemetry didn't confirm. Whichever lanes already published stay published;
 * this only stops the ones that have not run yet. The daemon's entry point
 * matches on this type to build the fatal report and the Telegram notice.
 */
export class SocialReleaseFailureError extends Error {
  readonly episodeId: string;
  readonly languageCode: SocialLanguageCode;
  readonly platform: SocialPlatform;
  readonly phase: SocialReleaseFailurePhase;
  readonly publishedLanes: readonly SocialPlatform[];
  readonly untouchedLanes: readonly SocialPlatform[];

  constructor(input: {
    episodeId: string;
    languageCode: SocialLanguageCode;
    platform: SocialPlatform;
    phase: SocialReleaseFailurePhase;
    cause: unknown;
    publishedLanes?: readonly SocialPlatform[];
    untouchedLanes?: readonly SocialPlatform[];
  }) {
    const detail = errorMessage(input.cause);
    super(
      `SOCIAL_RELEASE_FAILED\nEpisode: ${input.episodeId}\nLanguage: ${input.languageCode}\nPlatform: ${input.platform}\nPhase: ${input.phase}\nCause: ${detail}`,
      { cause: input.cause },
    );
    this.name = 'SocialReleaseFailureError';
    this.episodeId = input.episodeId;
    this.languageCode = input.languageCode;
    this.platform = input.platform;
    this.phase = input.phase;
    this.publishedLanes = input.publishedLanes ?? [];
    this.untouchedLanes = input.untouchedLanes ?? [];
  }
}

/**
 * Raised once `generateSocialCopy` has spent every attempt on one
 * episode|language and the copy is still invalid. Deliberately not a
 * `SocialReleaseFailurePhase`: nothing was transported, nothing is unreadable,
 * and reusing `SocialReleaseFailureError` would pull this into that type's
 * attempt-refund branch, its transient-network carve-out, and the fatal report
 * vocabulary keyed on `phase`. The daemon holds the article on this type
 * instead, because the same three attempts would fail identically after a
 * restart and fatal there is an unbounded loop that never spends an attempt.
 */
export class SocialCopyGenerationError extends Error {
  readonly episodeId: string;
  readonly languageCode: SocialLanguageCode;
  readonly attempts: number;
  /** The final attempt's rejection, reused verbatim for `last_error`. */
  readonly reason: string;

  constructor(input: {
    episodeId: string;
    languageCode: SocialLanguageCode;
    attempts: number;
    reason: string;
    cause: unknown;
  }) {
    super(
      `OpenRouter returned invalid social copy ${input.attempts} times. Last failure: ${input.reason}`,
      { cause: input.cause },
    );
    this.name = 'SocialCopyGenerationError';
    this.episodeId = input.episodeId;
    this.languageCode = input.languageCode;
    this.attempts = input.attempts;
    this.reason = input.reason;
  }
}
