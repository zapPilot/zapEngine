import { describe, expect, it } from 'vitest';

import { isPanewsHostname } from './panews.js';

describe('isPanewsHostname', () => {
  it.each([
    'panews.io',
    'www.panewslab.com',
    'WWW.PANEWS.IO.',
    'www.panewslab.com..',
  ])('accepts publisher host %s', (host) =>
    expect(isPanewsHostname(host)).toBe(true),
  );
  it.each(['panews.io.example.com', 'fakepanewslab.com', 'example.com', ''])(
    'rejects unrelated host %s',
    (host) => expect(isPanewsHostname(host)).toBe(false),
  );
});
