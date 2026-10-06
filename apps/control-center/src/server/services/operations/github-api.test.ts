import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { githubPages, githubAccessUnavailable } from './github-api.js';
import { HttpStatusError } from './http.js';

const input = {
  token: 'test',
  label: 'Test',
  path: 'dependabot/alerts?state=open&per_page=100',
  schema: z.object({ number: z.number() }),
};
it('follows cursor URLs verbatim, caps at two pages, and only sends GET', async () => {
  const cursor =
    'https://api.github.com/repositories/123/dependabot/alerts?after=abc';
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response('[{"number":1}]', {
        headers: { link: `<${cursor}>; rel="next"` },
      }),
    )
    .mockResolvedValueOnce(
      new Response('[{"number":2}]', {
        headers: { link: `<${cursor}2>; rel="next"` },
      }),
    );
  expect(await githubPages({ ...input, fetchImpl })).toEqual({
    rows: [{ number: 1 }, { number: 2 }],
    truncated: true,
  });
  expect(fetchImpl.mock.calls[1]?.[0]).toBe(cursor);
  for (const [, init] of fetchImpl.mock.calls) {
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
  }
});
it('finishes with no next link and rejects external origins or invalid rows', async () => {
  expect(
    await githubPages({
      ...input,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response('[]')),
    }),
  ).toEqual({ rows: [], truncated: false });
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response('[]', {
      headers: { link: '<https://evil.test/alerts>; rel="next"' },
    }),
  );
  await expect(githubPages({ ...input, fetchImpl })).rejects.toThrow(
    'external origin',
  );
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await expect(
    githubPages({
      ...input,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response('[{}]')),
    }),
  ).rejects.toThrow('unrecognised body');
});
it.each([
  [401, {}, false],
  [403, {}, true],
  [404, {}, true],
  [403, { 'x-ratelimit-remaining': '0' }, false],
  [403, { 'retry-after': '1' }, false],
  [500, {}, false],
])('classifies HTTP %s', (status, headers, unavailable) => {
  expect(
    githubAccessUnavailable(
      new HttpStatusError(
        'Test',
        status as number,
        new Headers(headers as Record<string, string>),
      ),
    ),
  ).toBe(unavailable);
});
it('does not classify transport errors as access failures', () =>
  expect(githubAccessUnavailable(new Error())).toBe(false));

it('keeps hide_secret=true on subsequent secret pages even if Link omits it', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response('[]', {
        headers: {
          link: '<https://api.github.com/repositories/123/secret-scanning/alerts?after=x>; rel="next"',
        },
      }),
    )
    .mockResolvedValueOnce(new Response('[]'));
  await githubPages({
    ...input,
    path: 'secret-scanning/alerts?state=open&per_page=100&hide_secret=true',
    fetchImpl,
  });
  expect(fetchImpl.mock.calls[1]?.[0]).toBe(
    'https://api.github.com/repositories/123/secret-scanning/alerts?after=x&hide_secret=true',
  );
});

it('preserves HTTP status, headers and the existing error message at the transport boundary', async () => {
  const fetchImpl = vi.fn<typeof fetch>(
    async () =>
      new Response('{}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      }),
  );
  const error = await githubPages({ ...input, fetchImpl }).catch(
    (failure: unknown) => failure,
  );
  expect(error).toBeInstanceOf(HttpStatusError);
  expect(error).toMatchObject({ status: 403, message: 'Test failed (403)' });
  expect((error as HttpStatusError).headers.get('x-ratelimit-remaining')).toBe(
    '0',
  );
});
