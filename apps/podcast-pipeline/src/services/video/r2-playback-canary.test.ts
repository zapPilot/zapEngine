import { describe, expect, it, vi } from 'vitest';

import {
  assertR2PlaybackReady,
  runR2PlaybackCanaryCli,
} from './r2-playback-canary.js';

describe('assertR2PlaybackReady', () => {
  it('verifies HTTPS range playback and CORS without writing an object', async () => {
    const fetchRange = vi.fn().mockResolvedValue(
      new Response('ok', {
        status: 206,
        headers: {
          'access-control-allow-origin': 'https://zappilot.ai',
          'content-range': 'bytes 0-1/123456',
        },
      }),
    );

    await expect(
      assertR2PlaybackReady('https://media.example.com/video.mp4', {
        fetchRange,
      }),
    ).resolves.toEqual({
      url: 'https://media.example.com/video.mp4',
      status: 206,
      contentRange: 'bytes 0-1/123456',
      corsOrigin: 'https://zappilot.ai',
    });
    expect(fetchRange).toHaveBeenCalledWith(
      'https://media.example.com/video.mp4',
      {
        method: 'GET',
        headers: {
          Origin: 'https://zappilot.ai',
          Range: 'bytes=0-1',
        },
      },
    );
  });

  it.each([
    [
      'full response',
      new Response(null, { status: 200 }),
      'returned 200; expected 206',
    ],
    [
      'missing range',
      new Response(null, {
        status: 206,
        headers: { 'access-control-allow-origin': '*' },
      }),
      'invalid Content-Range: missing',
    ],
    [
      'missing CORS',
      new Response(null, {
        status: 206,
        headers: { 'content-range': 'bytes 0-1/10' },
      }),
      'does not allow CORS origin',
    ],
  ])('rejects a %s response', async (_label, response, message) => {
    await expect(
      assertR2PlaybackReady('https://media.example.com/video.mp4', {
        fetchRange: vi.fn().mockResolvedValue(response),
      }),
    ).rejects.toThrow(message);
  });

  it.each([
    ['http://media.example.com/video.mp4', 'public HTTPS URL'],
    ['https://bucket.r2.dev/video.mp4', 'production public domain'],
    ['not-a-url', 'valid public HTTPS URL'],
  ])('rejects unsuitable public URL %s', async (url, message) => {
    await expect(assertR2PlaybackReady(url)).rejects.toThrow(message);
  });
});

describe('runR2PlaybackCanaryCli', () => {
  it('requires exactly one URL', async () => {
    await expect(runR2PlaybackCanaryCli([])).rejects.toThrow(
      'Usage: video:r2-canary',
    );
  });
});
