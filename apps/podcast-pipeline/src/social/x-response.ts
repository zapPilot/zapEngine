import { isPlainRecord as isRecord } from '../lib/typeGuards.js';

export function isCreateTweetResponseUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      (url.hostname === 'x.com' || url.hostname === 'twitter.com') &&
      /\/CreateTweet(?:\/|$)/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function extractCreatedTweetId(value: unknown): string | null {
  const targeted = nestedValue(value, [
    'data',
    'create_tweet',
    'tweet_results',
    'result',
    'rest_id',
  ]);
  if (nonemptyDigits(targeted)) return targeted;
  return findRestId(value, 0);
}

function nestedValue(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function findRestId(value: unknown, depth: number): string | null {
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findRestId(item, depth + 1);
      if (match) return match;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (nonemptyDigits(value['rest_id'])) return value['rest_id'];

  const preferredKeys = [
    'data',
    'create_tweet',
    'tweet_results',
    'result',
    'tweet',
  ];
  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    const match = findRestId(value[key], depth + 1);
    if (match) return match;
  }
  return null;
}

function nonemptyDigits(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/u.test(value);
}
