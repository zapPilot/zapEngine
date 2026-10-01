import { describe, expect, it, vi } from 'vitest';

import {
  describeThreadsApiError,
  nonemptyString,
  parseThreadsApiJson,
  readThreadsPermalink,
} from './threads-api.js';

describe('Threads API helpers', () => {
  it('parses JSON and fails closed for blank or malformed payloads', () => {
    expect(parseThreadsApiJson('{"id":"thread-1"}')).toEqual({
      id: 'thread-1',
    });
    expect(parseThreadsApiJson('   ')).toBeNull();
    expect(parseThreadsApiJson('{broken')).toBeNull();
  });

  it('prefers the structured Threads error message', () => {
    expect(
      describeThreadsApiError(
        400,
        { error: { message: '  Invalid access token  ' } },
        'fallback',
      ),
    ).toBe('Threads API 400: Invalid access token');
  });

  it('uses trimmed raw fallback text or the generic failure message', () => {
    expect(describeThreadsApiError(503, null, '  upstream unavailable  ')).toBe(
      'Threads API 503: upstream unavailable',
    );
    expect(describeThreadsApiError(500, { error: {} }, '   ')).toBe(
      'Threads API 500: request failed',
    );
  });

  it('distinguishes nonempty strings from invalid values', () => {
    expect(nonemptyString(' value ')).toBe(true);
    expect(nonemptyString('   ')).toBe(false);
    expect(nonemptyString(123)).toBe(false);
  });
});

describe('readThreadsPermalink', () => {
  it.each(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'])(
    'preserves the supported permalink on %s',
    async (host) => {
      const permalink = `https://${host}/@zap/post/shortcode`;
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ permalink: ` ${permalink} ` })),
        );
      await expect(
        readThreadsPermalink({
          postId: 'id/1',
          accessToken: 'token',
          fetchImpl,
        }),
      ).resolves.toBe(permalink);
      expect((fetchImpl.mock.calls[0]?.[0] as URL).pathname).toBe('/id%2F1');
    },
  );
  it.each([
    null,
    {},
    { permalink: '' },
    { permalink: 1 },
    { permalink: 'not a URL' },
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- Invalid input verifies HTTPS enforcement.
    { permalink: 'http://www.threads.com/@zap/post/a' },
    { permalink: 'https://evil.test/@zap/post/a' },
    { permalink: 'https://www.threads.com/login' },
    { permalink: 'https://user@www.threads.com/@zap/post/a' },
    { permalink: 'https://:secret@www.threads.com/@zap/post/a' },
  ])('does not manufacture a link from invalid readback %#', async (body) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(
      readThreadsPermalink({ postId: '123', accessToken: 'token', fetchImpl }),
    ).resolves.toBeNull();
  });
  it('swallows API failures without logging credentials or response bodies', async () => {
    const onLog = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('secret', { status: 403 }));
    await expect(
      readThreadsPermalink({
        postId: '123',
        accessToken: 'secret',
        fetchImpl,
        onLog,
      }),
    ).resolves.toBeNull();
    expect(onLog.mock.calls.flat().join()).not.toContain('secret');
  });
});
