import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildFishAudioCostLine,
  getMetadata,
  synthesize,
} from './fish-audio.js';

function streamResponse(chunks: Uint8Array[]): Response {
  let index = 0;
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true, value: undefined };
            }
            const value = chunks[index]!;
            index += 1;
            return { done: false, value };
          },
          releaseLock() {},
        };
      },
    },
  } as unknown as Response;
}

function errorResponse(
  status: number,
  statusText: string,
  body: string,
): Response {
  return {
    ok: false,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

vi.mock('./audio-concat.js', () => ({
  concatMp3Buffers: vi.fn().mockImplementation(async (buffers: Buffer[]) => {
    if (buffers.length === 1) return buffers[0];
    const combined = Buffer.concat(buffers);
    return combined;
  }),
}));

describe('Fish Audio TTS provider', () => {
  beforeEach(() => {
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_REQUEST_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '1500');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts a script to Fish Audio and returns an MP3 buffer', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize('哈囉，這是 Fish Audio 測試', {
      languageCode: 'zh-Hant',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-model-id',
        engine: 's1',
      },
      costLabel: 'TTS main audio',
    });

    expect(result.audio).toEqual(Buffer.from([0x49, 0x44, 0x33, 0x04]));
    expect(result.cost).toEqual([
      expect.objectContaining({
        category: 'tts',
        label: 'TTS main audio',
        provider: 'fish-audio',
        model: 's1',
      }),
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.fish.audio/v1/tts',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer fish-test-key',
          'content-type': 'application/json',
          model: 's1',
        },
      }),
    );

    const [, init] = mockFetch.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({
      text: '哈囉，這是 Fish Audio 測試',
      reference_id: 'custom-model-id',
      format: 'mp3',
      mp3_bitrate: 128,
      chunk_length: 200,
      normalize: true,
      latency: 'normal',
    });
  });

  it('sends s2.1-pro-free as the Fish Audio model header when configured', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await synthesize('Hello! Welcome to Fish Audio', {
      languageCode: 'en',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-reference-id',
        engine: 's2.1-pro-free',
      },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.fish.audio/v1/tts',
      expect.objectContaining({
        headers: {
          authorization: 'Bearer fish-test-key',
          'content-type': 'application/json',
          model: 's2.1-pro-free',
        },
      }),
    );

    const [, init] = mockFetch.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual(
      expect.objectContaining({
        reference_id: 'custom-reference-id',
      }),
    );
  });

  it('retries transient Fish Audio failures before succeeding', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, '', 'rate limit exceeded'))
      .mockResolvedValueOnce(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize('retry me', {
      languageCode: 'en',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-reference-id',
        engine: 's2.1-pro-free',
      },
    });

    expect(result.audio).toEqual(Buffer.from([0x49, 0x44, 0x33, 0x04]));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries request errors before succeeding', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize('retry request error', {
      languageCode: 'ja',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-reference-id',
        engine: 's2.1-pro-free',
      },
    });

    expect(result.audio).toEqual(Buffer.from([0x49, 0x44, 0x33, 0x04]));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient Fish Audio errors', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(errorResponse(402, 'Payment Required', 'no credit'));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await expect(
      synthesize('do not retry', {
        languageCode: 'en',
        usage: 'main',
        config: {
          provider: 'fish-audio',
          modelId: 'custom-reference-id',
          engine: 's2.1-pro-free',
        },
      }),
    ).rejects.toThrow('Fish Audio TTS failed: 402 Payment Required: no credit');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('estimates cost from UTF-8 input bytes', () => {
    const cost = buildFishAudioCostLine('測試', {
      languageCode: 'zh-Hant',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-model-id',
        engine: 's2-pro',
      },
      costLabel: 'TTS main audio',
    });

    expect(cost).toEqual({
      category: 'tts',
      label: 'TTS main audio',
      provider: 'fish-audio',
      model: 's2-pro',
      costUsd: 0.00009,
      usage: {
        unit: 'utf8_bytes',
        quantity: 6,
        unitPriceUsd: 0.000015,
      },
    });
  });

  it('uses the default TTS audio label when no cost label is provided', () => {
    const cost = buildFishAudioCostLine('測試', {
      languageCode: 'zh-Hant',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-model-id',
        engine: 's2-pro',
      },
    });

    expect(cost.label).toBe('TTS audio');
  });

  it('throws when FISH_AUDIO_API_KEY is missing', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', '');

    await expect(
      synthesize('缺少金鑰', {
        languageCode: 'zh-Hant',
        usage: 'main',
        config: {
          provider: 'fish-audio',
          modelId: 'custom-model-id',
          engine: 's2-pro',
        },
      }),
    ).rejects.toThrow('FISH_AUDIO_API_KEY is required for Fish Audio TTS');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws with status and truncated body when Fish Audio returns an error', async () => {
    const longBody = `service unavailable ${'x'.repeat(500)}`;
    const mockFetch = vi
      .fn()
      .mockResolvedValue(errorResponse(503, 'Service Unavailable', longBody));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    let error: unknown;
    try {
      await synthesize('服務錯誤', {
        languageCode: 'zh-Hant',
        usage: 'main',
        config: {
          provider: 'fish-audio',
          modelId: 'custom-model-id',
          engine: 's2-pro',
        },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(
      /Fish Audio TTS failed: 503 Service Unavailable: service unavailable/,
    );
    expect((error as Error).message).not.toContain('x'.repeat(500));
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('builds metadata from the resolved Fish Audio language config', () => {
    expect(
      getMetadata({
        languageCode: 'ja',
        usage: 'main',
        config: {
          provider: 'fish-audio',
          modelId: 'custom-ja-model',
          engine: 's2-pro',
        },
      }),
    ).toEqual({
      provider: 'fish-audio',
      languageCode: 'ja',
      voiceName: 'custom-ja-model',
    });
  });

  it('throws when response.text() throws during error body reading', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: vi.fn().mockRejectedValue(new Error('text extraction failed')),
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await expect(
      synthesize('測試', {
        languageCode: 'zh-Hant',
        usage: 'main',
        config: {
          provider: 'fish-audio',
          modelId: 'custom-model-id',
          engine: 's2-pro',
        },
      }),
    ).rejects.toThrow('Fish Audio TTS failed: 500 Internal Server Error');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws with status and short (untruncated) body when error response body is short', async () => {
    const shortBody = 'rate limit exceeded';
    const mockFetch = vi
      .fn()
      .mockResolvedValue(errorResponse(429, '', shortBody));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await expect(
      synthesize('測試', {
        languageCode: 'zh-Hant',
        usage: 'main',
        config: {
          provider: 'fish-audio',
          modelId: 'custom-model-id',
          engine: 's2-pro',
        },
      }),
    ).rejects.toThrow('Fish Audio TTS failed: 429: rate limit exceeded');
  });

  it('throws when getFishAudioConfig detects wrong provider', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await expect(
      synthesize('測試', {
        languageCode: 'zh-Hant',
        usage: 'main',
        config: {
          provider: 'google',
          modelId: 'wrong-provider',
          voiceName: 'some-voice',
        } as never,
      }),
    ).rejects.toThrow('Fish Audio TTS received google language config');
  });

  it('reads audio via stream reader instead of arrayBuffer()', async () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
    const mockFetch = vi.fn().mockResolvedValue(streamResponse([bytes]));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize('stream reader test', {
      languageCode: 'en',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'model-id',
        engine: 's2-pro',
      },
    });

    expect(result.audio).toEqual(Buffer.from(bytes));
  });

  it('reassembles multiple stream chunks into a single buffer', async () => {
    const chunk1 = new Uint8Array([0x49, 0x44]);
    const chunk2 = new Uint8Array([0x33, 0x04]);
    const mockFetch = vi
      .fn()
      .mockResolvedValue(streamResponse([chunk1, chunk2]));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize('multi chunk stream', {
      languageCode: 'en',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'model-id',
        engine: 's2-pro',
      },
    });

    expect(result.audio).toEqual(Buffer.from([0x49, 0x44, 0x33, 0x04]));
  });

  it('splits long text into multiple chunks and concatenates', async () => {
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '50');
    vi.stubEnv('FISH_AUDIO_REQUEST_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');

    const longText = 'あ'.repeat(120);
    const mockFetch = vi
      .fn()
      .mockResolvedValue(streamResponse([new Uint8Array([0x01, 0x02])]));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize(longText, {
      languageCode: 'ja',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'ja-model',
        engine: 's2-pro',
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.audio).toBeDefined();
  });

  it('logs progress with an ETA after each completed chunk', async () => {
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '50');
    vi.stubEnv('FISH_AUDIO_REQUEST_DELAY_MS', '0');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const longText = 'あ'.repeat(120);
    const mockFetch = vi
      .fn()
      .mockResolvedValue(streamResponse([new Uint8Array([0x01, 0x02])]));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await synthesize(longText, {
      languageCode: 'ja',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'ja-model',
        engine: 's2-pro',
      },
    });

    const progressCalls = logSpy.mock.calls.filter(
      ([message]) => message === '[/tts] Fish Audio TTS progress',
    );
    expect(progressCalls).toHaveLength(3);
    expect(progressCalls[0]?.[1]).toEqual(
      expect.objectContaining({
        progress: '[#######-------------] 1/3 33%',
        completedChunks: 1,
        totalChunks: 3,
        eta: expect.any(String),
      }),
    );
    expect(progressCalls[2]?.[1]).toEqual(
      expect.objectContaining({
        progress: '[####################] 3/3 100%',
        completedChunks: 3,
        totalChunks: 3,
        eta: '0s',
      }),
    );
  });

  it('retries only the failing chunk, not the entire text', async () => {
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '50');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_REQUEST_DELAY_MS', '0');

    const longText = 'い'.repeat(120);
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(streamResponse([new Uint8Array([0x01])]))
      .mockResolvedValueOnce(errorResponse(429, '', 'rate limit'))
      .mockResolvedValueOnce(streamResponse([new Uint8Array([0x02])]))
      .mockResolvedValueOnce(streamResponse([new Uint8Array([0x03])]));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize(longText, {
      languageCode: 'ja',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'ja-model',
        engine: 's2.1-pro-free',
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(result.audio).toBeDefined();
  });

  it('throws after exhausting per-chunk retries', async () => {
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '50');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_REQUEST_DELAY_MS', '0');

    const longText = 'う'.repeat(120);
    const mockFetch = vi
      .fn()
      .mockResolvedValue(errorResponse(503, 'Service Unavailable', 'down'));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await expect(
      synthesize(longText, {
        languageCode: 'ja',
        usage: 'main',
        config: {
          provider: 'fish-audio',
          modelId: 'ja-model',
          engine: 's2-pro',
        },
      }),
    ).rejects.toThrow(/Fish Audio TTS failed: 503/);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not split short text into chunks', async () => {
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '1500');
    const mockFetch = vi
      .fn()
      .mockResolvedValue(streamResponse([new Uint8Array([0x49, 0x44])]));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await synthesize('short text', {
      languageCode: 'en',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'model-id',
        engine: 's2-pro',
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('splits on sentence boundaries when possible', async () => {
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '20');
    vi.stubEnv('FISH_AUDIO_REQUEST_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');

    const text =
      'これは最初の文です。これは二番目の文です。これは三番目の文です。';
    const mockFetch = vi
      .fn()
      .mockResolvedValue(streamResponse([new Uint8Array([0x01])]));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize(text, {
      languageCode: 'ja',
      usage: 'main',
      config: {
        provider: 'fish-audio',
        modelId: 'ja-model',
        engine: 's2-pro',
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(
      (mockFetch.mock.calls[0] as [string, { body: string }])[1].body,
    );
    expect(firstBody.text).toContain('。');

    const secondBody = JSON.parse(
      (mockFetch.mock.calls[1] as [string, { body: string }])[1].body,
    );
    expect(secondBody.text).toContain('。');

    expect(result.audio).toBeDefined();
  });
});
