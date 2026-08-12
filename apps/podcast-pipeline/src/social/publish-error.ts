import type { SocialPlatform } from './types.js';

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  x: 'X',
  rednote: 'REDNOTE',
};

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
      `${PLATFORM_LABELS[platform]}_PUBLISH_FAILED\nStep: ${step}\nCause: ${detail}`,
      { cause },
    );
    this.name = 'SocialPublishError';
  }
}
