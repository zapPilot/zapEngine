import { describe, expect, it } from 'vitest';

import { SocialPublishError } from './publish-error.js';

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
