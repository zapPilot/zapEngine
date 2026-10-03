import { describe, expect, it, vi } from 'vitest';

import { fishRequestInit, synthesize } from './fish-audio';

const request = {
  apiKey: 'test-key',
  referenceId: 'voice',
  engine: 's2-pro',
  text: 'Hello.',
  speed: 1.06,
};

const audio = (bytes: number[]) =>
  new Response(new Uint8Array(bytes), { status: 200 });
const noSleep = () => Promise.resolve();

describe('fishRequestInit', () => {
  it('sends the podcast voice parameters with the engine as the model header', () => {
    const init = fishRequestInit(request);
    expect(init.headers).toEqual({
      authorization: 'Bearer test-key',
      'content-type': 'application/json',
      model: 's2-pro',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      text: 'Hello.',
      reference_id: 'voice',
      format: 'mp3',
      mp3_bitrate: 192,
      normalize: true,
      latency: 'normal',
      prosody: { speed: 1.06, volume: 0 },
    });
  });
});

describe('synthesize', () => {
  it('returns the audio bytes', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(audio([1, 2, 3]));
    await expect(
      synthesize(request, { fetchImpl, sleep: noSleep }),
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.fish.audio/v1/tts',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('retries rate limits and network failures with growing delays', async () => {
    const sleep = vi.fn(noSleep);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockRejectedValueOnce(new TypeError('socket hang up'))
      .mockResolvedValueOnce(audio([9]));
    await expect(
      synthesize(request, { fetchImpl, sleep, retryDelayMs: 10 }),
    ).resolves.toEqual(Buffer.from([9]));
    expect(sleep.mock.calls).toEqual([[10], [20]]);
  });

  it('gives up after the last attempt', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response('busy', { status: 503 })),
      );
    await expect(
      synthesize(request, { fetchImpl, sleep: noSleep, attempts: 2 }),
    ).rejects.toThrow('Fish Audio TTS 503: busy');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('bad voice', { status: 400 }));
    await expect(
      synthesize(request, { fetchImpl, sleep: noSleep }),
    ).rejects.toThrow('Fish Audio TTS 400: bad voice');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses the global fetch when none is injected', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(audio([5]));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      await expect(synthesize(request)).resolves.toEqual(Buffer.from([5]));
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('waits with real timers by default', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('', { status: 500 }))
        .mockResolvedValueOnce(audio([7]));
      const pending = synthesize(request, { fetchImpl, retryDelayMs: 1_000 });
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toEqual(Buffer.from([7]));
    } finally {
      vi.useRealTimers();
    }
  });
});
