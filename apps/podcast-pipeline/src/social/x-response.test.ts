import { describe, expect, it } from 'vitest';

import {
  extractCreatedTweetId,
  isCreateTweetResponseUrl,
} from './x-response.js';

describe('X CreateTweet response parsing', () => {
  it('matches only GraphQL CreateTweet endpoints on X hosts', () => {
    expect(
      isCreateTweetResponseUrl(
        'https://x.com/i/api/graphql/abc123/CreateTweet?variables=%7B%7D',
      ),
    ).toBe(true);
    expect(
      isCreateTweetResponseUrl(
        'https://twitter.com/i/api/graphql/abc123/CreateTweet',
      ),
    ).toBe(true);
    expect(isCreateTweetResponseUrl('https://x.com/home')).toBe(false);
    expect(isCreateTweetResponseUrl('https://example.com/CreateTweet')).toBe(
      false,
    );
    expect(isCreateTweetResponseUrl('not-a-url')).toBe(false);
  });

  it('extracts the normal CreateTweet rest_id', () => {
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

  it('supports nested tweet variants and arrays', () => {
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
    expect(
      extractCreatedTweetId({
        data: [{ ignored: true }, { tweet: { rest_id: '222333444' } }],
      }),
    ).toBe('222333444');
  });

  it('fails closed for malformed or unsuccessful response shapes', () => {
    expect(extractCreatedTweetId({ rest_id: 'not-an-id' })).toBeNull();
    expect(
      extractCreatedTweetId({ errors: [{ message: 'failed' }] }),
    ).toBeNull();
    expect(extractCreatedTweetId([])).toBeNull();
    expect(extractCreatedTweetId(null)).toBeNull();
  });
});
