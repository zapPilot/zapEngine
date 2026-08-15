import type { SocialPlatform } from './types.js';

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
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `${platform.toUpperCase()}_PUBLISH_FAILED\nStep: ${step}\nCause: ${detail}`,
      { cause },
    );
    this.name = 'SocialPublishError';
  }
}
