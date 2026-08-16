import { describe, expect, it } from 'vitest';

import {
  extractCreatedTweetId,
  isCreateTweetResponseUrl,
} from './x-playwright.js';

describe('X CreateTweet success detection', () => {
  it('matches the GraphQL CreateTweet endpoint but not unrelated X navigation', () => {
    expect(
      isCreateTweetResponseUrl(
        'https://x.com/i/api/graphql/abc123/CreateTweet?variables=%7B%7D',
      ),
    ).toBe(true);
    expect(isCreateTweetResponseUrl('https://x.com/home')).toBe(false);
    expect(isCreateTweetResponseUrl('https://x.com/i/flow/login')).toBe(false);
    expect(isCreateTweetResponseUrl('not-a-url')).toBe(false);
  });

  it('extracts the created tweet id from the normal CreateTweet response shape', () => {
    expect(
      extractCreatedTweetId({
        data: {
          create_tweet: {
            tweet_results: {
              result: { rest_id: '1234567890123456789' },
            },
          },
        },
      }),
    ).toBe('1234567890123456789');
  });

  it('supports nested result variants but rejects non-numeric ids', () => {
    expect(
      extractCreatedTweetId({
        data: {
          create_tweet: {
            tweet_results: {
              result: { tweet: { rest_id: '987654321' } },
            },
          },
        },
      }),
    ).toBe('987654321');
    expect(extractCreatedTweetId({ rest_id: 'not-an-id' })).toBeNull();
    expect(extractCreatedTweetId({ errors: [{ message: 'failed' }] })).toBeNull();
  });
});
