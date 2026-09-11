import { describe, expect, it } from 'vitest';

import {
  SocialCopyGenerationError,
  SocialPublishError,
  SocialReleaseFailureError,
} from './publish-error.js';

describe('SocialPublishError', () => {
  it('retains an Error cause and labels an X step', () => {
    const cause = new Error('network unavailable');

    const error = new SocialPublishError('x', 'post', cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SocialPublishError');
    expect(error.platform).toBe('x');
    expect(error.step).toBe('post');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe(
      'X_PUBLISH_FAILED\nStep: post\nCause: network unavailable',
    );
  });

  it('stringifies a non-Error cause and labels a Rednote step', () => {
    const error = new SocialPublishError('rednote', 'fill_title', 'rejected');

    expect(error.platform).toBe('rednote');
    expect(error.step).toBe('fill_title');
    expect(error.cause).toBe('rejected');
    expect(error.message).toBe(
      'REDNOTE_PUBLISH_FAILED\nStep: fill_title\nCause: rejected',
    );
  });
});

describe('SocialCopyGenerationError', () => {
  it('keeps the operator-facing exhaustion message and the last rejection', () => {
    const cause = new Error('judge verdict');

    const error = new SocialCopyGenerationError({
      episodeId: '123e4567-e89b-42d3-a456-426614174000',
      languageCode: 'zh-Hant',
      attempts: 3,
      reason: 'Rednote copy breaks investment-direction red lines (R1 …)',
      cause,
    });

    expect(error.name).toBe('SocialCopyGenerationError');
    expect(error.episodeId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(error.languageCode).toBe('zh-Hant');
    expect(error.attempts).toBe(3);
    expect(error.reason).toContain('investment-direction red lines');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe(
      'OpenRouter returned invalid social copy 3 times. Last failure: Rednote copy breaks investment-direction red lines (R1 …)',
    );
  });

  // The daemon holds an article on this type and stays fatal on the other. If
  // they ever shared an ancestor, the attempt-refund branch and the fatal
  // report vocabulary would both start catching copy failures by accident.
  it('is not a release failure', () => {
    const error = new SocialCopyGenerationError({
      episodeId: '123e4567-e89b-42d3-a456-426614174000',
      languageCode: 'zh-Hant',
      attempts: 3,
      reason: 'unknown',
      cause: undefined,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SocialReleaseFailureError);
  });
});
