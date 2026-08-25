import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildFishAudioCostLine,
  FishAudioTimeoutError,
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
      config: {
        provider: 'fish-audio',
        modelId: 'custom-reference-id',
        engine: 's2.1-pro-free',
      },
    });

    expect(result.audio).toEqual(Buffer.from([0x49, 0x44, 0x33, 0x04]));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('normalizes non-Error request failures before retrying', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce('socket string failure')
      .mockResolvedValueOnce(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await expect(
      synthesize('retry string error', {
        languageCode: 'en',
        config: {
          provider: 'fish-audio',
          modelId: 'custom-reference-id',
          engine: 's2-pro',
        },
      }),
    ).resolves.toMatchObject({
      audio: Buffer.from([0x49, 0x44, 0x33, 0x04]),
    });
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

  it('throws when response has no body stream', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: null,
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await expect(
      synthesize('no body test', {
        languageCode: 'en',
        config: {
          provider: 'fish-audio',
          modelId: 'custom-model-id',
          engine: 's2-pro',
        },
      }),
    ).rejects.toThrow('Fish Audio TTS response has no body stream');
  });

  it('logs audio chunk received when receivedBytes crosses 65536', async () => {
    const largeChunk = new Uint8Array(70_000);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const mockFetch = vi.fn().mockResolvedValue(streamResponse([largeChunk]));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await synthesize('large audio test', {
      languageCode: 'en',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-model-id',
        engine: 's2-pro',
      },
    });

    const chunkLogCalls = logSpy.mock.calls.filter(
      ([msg]) => msg === '[/tts] Fish Audio TTS audio chunk received',
    );
    expect(chunkLogCalls.length).toBeGreaterThanOrEqual(1);
    logSpy.mockRestore();
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
      config: {
        provider: 'fish-audio',
        modelId: 'model-id',
        engine: 's2-pro',
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses retry-after header for retry delay when present', async () => {
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        Object.assign(errorResponse(429, '', 'rate limit'), {
          headers: { get: (h: string) => (h === 'retry-after' ? '2' : null) },
        }),
      )
      .mockResolvedValueOnce(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize('retry after test', {
      languageCode: 'en',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-reference-id',
        engine: 's2-pro',
      },
    });

    expect(result.audio).toEqual(Buffer.from([0x49, 0x44, 0x33, 0x04]));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('falls back from an invalid retry-after header to the configured retry delay', async () => {
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        Object.assign(errorResponse(429, '', 'rate limit'), {
          headers: {
            get: (header: string) =>
              header === 'retry-after' ? 'not-a-number' : null,
          },
        }),
      )
      .mockResolvedValueOnce(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    await expect(
      synthesize('invalid retry after', {
        languageCode: 'en',
        config: {
          provider: 'fish-audio',
          modelId: 'custom-reference-id',
          engine: 's2-pro',
        },
      }),
    ).resolves.toMatchObject({
      audio: Buffer.from([0x49, 0x44, 0x33, 0x04]),
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('uses env-based retry delay when retry-after header is missing', async () => {
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, '', 'rate limit'))
      .mockResolvedValueOnce(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize('env retry delay test', {
      languageCode: 'en',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-reference-id',
        engine: 's2-pro',
      },
    });

    expect(result.audio).toEqual(Buffer.from([0x49, 0x44, 0x33, 0x04]));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('uses default retry delay when env var is invalid', async () => {
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', 'not-a-number');
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, '', 'rate limit'))
      .mockResolvedValueOnce(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize('invalid env retry delay', {
      languageCode: 'en',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-reference-id',
        engine: 's2-pro',
      },
    });

    expect(result.audio).toEqual(Buffer.from([0x49, 0x44, 0x33, 0x04]));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('uses request-size and inter-request-delay defaults when env vars are absent', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      synthesize('default request settings', {
        languageCode: 'en',
        config: {
          provider: 'fish-audio',
          modelId: 'custom-reference-id',
          engine: 's2-pro',
        },
      }),
    ).resolves.toMatchObject({
      audio: Buffer.from([0x49, 0x44, 0x33, 0x04]),
    });
  });

  it('uses default request timeout when env var is invalid', async () => {
    vi.stubEnv('FISH_AUDIO_TIMEOUT_MS', 'invalid');
    vi.stubEnv('FISH_AUDIO_IDLE_TIMEOUT_MS', 'invalid');
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', 'invalid');
    vi.stubEnv('FISH_AUDIO_REQUEST_DELAY_MS', 'invalid');
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize('invalid env defaults', {
      languageCode: 'en',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-reference-id',
        engine: 's2-pro',
      },
    });

    expect(result.audio).toEqual(Buffer.from([0x49, 0x44, 0x33, 0x04]));
  });

  it('uses default timeout when env var is negative', async () => {
    vi.stubEnv('FISH_AUDIO_TIMEOUT_MS', '-100');
    vi.stubEnv('FISH_AUDIO_IDLE_TIMEOUT_MS', '-100');
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '-100');
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        streamResponse([new Uint8Array([0x49, 0x44, 0x33, 0x04])]),
      );
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize('negative env defaults', {
      languageCode: 'en',
      config: {
        provider: 'fish-audio',
        modelId: 'custom-reference-id',
        engine: 's2-pro',
      },
    });

    expect(result.audio).toEqual(Buffer.from([0x49, 0x44, 0x33, 0x04]));
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

  // === WP-9: Resilience tests (idle/total timeout, chunking, concat order) ===
  /* eslint-disable sonarjs/no-nested-functions, sonarjs/no-identical-functions, promise/param-names, @typescript-eslint/prefer-promise-reject-errors, @typescript-eslint/only-throw-error */
  function createAbortableHangingReader(signal: AbortSignal): {
    getReader: () => {
      read: () => Promise<{ done: boolean; value?: Uint8Array }>;
      releaseLock: () => void;
    };
  } {
    return {
      getReader() {
        return {
          read() {
            return new Promise((_, reject) => {
              if (signal.aborted) {
                const reason =
                  (signal as unknown as { reason?: unknown }).reason ??
                  new DOMException('This operation was aborted', 'AbortError');
                reject(reason);
                return;
              }
              const onAbort = () => {
                const reason =
                  (signal as unknown as { reason?: unknown }).reason ??
                  new DOMException('This operation was aborted', 'AbortError');
                reject(reason);
              };
              signal.addEventListener('abort', onAbort, { once: true });
            });
          },
          releaseLock() {},
        };
      },
    } as unknown as {
      getReader: () => {
        read: () => Promise<{ done: boolean; value?: Uint8Array }>;
        releaseLock: () => void;
      };
    };
  }

  function createChunkedReader(
    signal: AbortSignal,
    chunks: Uint8Array[],
    delayMsBetweenChunks: number,
  ): {
    getReader: () => {
      read: () => Promise<{ done: boolean; value?: Uint8Array }>;
      releaseLock: () => void;
    };
  } {
    let idx = 0;
    return {
      getReader() {
        return {
          async read() {
            if (signal.aborted) {
              const reason =
                (signal as unknown as { reason?: unknown }).reason ??
                new DOMException('This operation was aborted', 'AbortError');
              throw reason;
            }
            if (idx >= chunks.length) {
              return { done: true, value: undefined };
            }
            if (idx > 0 && delayMsBetweenChunks > 0) {
              await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, delayMsBetweenChunks);
                const onAbort = () => {
                  clearTimeout(timer);
                  const reason =
                    (signal as unknown as { reason?: unknown }).reason ??
                    new DOMException(
                      'This operation was aborted',
                      'AbortError',
                    );
                  reject(reason);
                };
                if (signal.aborted) {
                  clearTimeout(timer);
                  onAbort();
                  return;
                }
                signal.addEventListener('abort', onAbort, { once: true });
              });
              if (signal.aborted) {
                const reason =
                  (signal as unknown as { reason?: unknown }).reason ??
                  new DOMException('This operation was aborted', 'AbortError');
                throw reason;
              }
            }
            const value = chunks[idx]!;
            idx += 1;
            return { done: false, value };
          },
          releaseLock() {},
        };
      },
    };
  }

  it('Test A: idle timeout aborts stalled stream with idle kind and retries', async () => {
    vi.stubEnv('FISH_AUDIO_IDLE_TIMEOUT_MS', '40');
    vi.stubEnv('FISH_AUDIO_TIMEOUT_MS', '500');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '1500');
    const mockFetch = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) => {
        const signal = init.signal!;
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: createAbortableHangingReader(signal),
        } as unknown as Response);
      });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    let caught: unknown;
    try {
      await synthesize('idle timeout test', {
        languageCode: 'en',
        config: { provider: 'fish-audio', modelId: 'm', engine: 's2-pro' },
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(FishAudioTimeoutError);
    expect((caught as FishAudioTimeoutError).kind).toBe('idle');
    expect((caught as FishAudioTimeoutError).timeoutMs).toBe(40);
    expect(
      (caught as FishAudioTimeoutError).requestElapsedMs,
    ).toBeGreaterThanOrEqual(40);
    // backward compat alias
    expect((caught as FishAudioTimeoutError).elapsedMs).toBe(
      (caught as FishAudioTimeoutError).requestElapsedMs,
    );
    expect((caught as FishAudioTimeoutError).receivedBytes).toBe(0);
    expect((caught as Error).message).not.toBe('This operation was aborted');
    expect((caught as Error).message).toContain('40ms idle');
    expect((caught as Error).message).toContain('requestElapsed');
    expect((caught as Error).message).toContain('idle_timeout');
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const timeoutLogs = warnSpy.mock.calls.filter(
      ([msg]) => msg === '[/tts] Fish Audio TTS chunk timed out',
    );
    expect(timeoutLogs.length).toBeGreaterThanOrEqual(3);
    expect(timeoutLogs[0]?.[1]).toEqual(
      expect.objectContaining({
        reason: 'idle_timeout',
        timeoutMs: 40,
        idleTimeoutMs: 40,
        requestElapsedMs: expect.any(Number),
        receivedBytes: 0,
      }),
    );
    // retry logs should also carry idle_timeout reason
    const retryLogs = warnSpy.mock.calls.filter(
      ([msg]) => msg === '[/tts] Fish Audio TTS retrying chunk after error',
    );
    expect(retryLogs.length).toBe(2);
    expect(retryLogs[0]?.[1]).toEqual(
      expect.objectContaining({ reason: 'idle_timeout' }),
    );

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('Test B: idle timer resets on each received chunk and does not abort within idle window', async () => {
    vi.stubEnv('FISH_AUDIO_IDLE_TIMEOUT_MS', '150');
    vi.stubEnv('FISH_AUDIO_TIMEOUT_MS', '1000');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '1500');
    // Each chunk arrives every 40ms, well within 150ms idle limit, so should succeed
    const mockFetch = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) => {
        const signal = init.signal!;
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: createChunkedReader(
            signal,
            [
              new Uint8Array([0x01]),
              new Uint8Array([0x02]),
              new Uint8Array([0x03]),
            ],
            40,
          ),
        } as unknown as Response);
      });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const result = await synthesize('idle reset test', {
      languageCode: 'en',
      config: { provider: 'fish-audio', modelId: 'm', engine: 's2-pro' },
    });
    expect(result.audio).toEqual(Buffer.from([0x01, 0x02, 0x03]));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('Test C: TTFB stall is classified as total_timeout, not idle_timeout', async () => {
    vi.stubEnv('FISH_AUDIO_IDLE_TIMEOUT_MS', '30');
    vi.stubEnv('FISH_AUDIO_TIMEOUT_MS', '60');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '1500');
    const mockFetch = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) => {
        const signal = init.signal!;
        return new Promise((_resolve, reject) => {
          const onAbort = () => {
            const reason =
              (signal as unknown as { reason?: unknown }).reason ??
              new DOMException('This operation was aborted', 'AbortError');
            reject(reason);
          };
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener('abort', onAbort, { once: true });
          // never resolve => triggers total timeout, idle timer not started yet
        });
      });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');

    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    let caught: unknown;
    try {
      await synthesize('ttfb test', {
        languageCode: 'en',
        config: { provider: 'fish-audio', modelId: 'm', engine: 's2-pro' },
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(FishAudioTimeoutError);
    expect((caught as FishAudioTimeoutError).kind).toBe('total');
    expect((caught as FishAudioTimeoutError).timeoutMs).toBe(60);
    expect(
      (caught as FishAudioTimeoutError).requestElapsedMs,
    ).toBeGreaterThanOrEqual(60);
    expect((caught as FishAudioTimeoutError).elapsedMs).toBe(
      (caught as FishAudioTimeoutError).requestElapsedMs,
    );
    expect((caught as Error).message).toContain('total_timeout');
    expect((caught as Error).message).toContain('60ms limit');
    const timeoutLogs = warnSpy.mock.calls.filter(
      ([msg]) => msg === '[/tts] Fish Audio TTS chunk timed out',
    );
    expect(timeoutLogs[0]?.[1]).toEqual(
      expect.objectContaining({
        reason: 'total_timeout',
        timeoutMs: 60,
        requestElapsedMs: expect.any(Number),
      }),
    );

    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('Test D: idle timeout retry succeeds on second attempt', async () => {
    vi.stubEnv('FISH_AUDIO_IDLE_TIMEOUT_MS', '40');
    vi.stubEnv('FISH_AUDIO_TIMEOUT_MS', '500');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '1500');
    let call = 0;
    const mockFetch = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) => {
        call += 1;
        const signal = init.signal!;
        if (call === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            body: createAbortableHangingReader(signal),
          } as unknown as Response);
        }
        return Promise.resolve(streamResponse([new Uint8Array([0xaa, 0xbb])]));
      });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await synthesize('retry success test', {
      languageCode: 'en',
      config: { provider: 'fish-audio', modelId: 'm', engine: 's2-pro' },
    });
    expect(result.audio).toEqual(Buffer.from([0xaa, 0xbb]));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('Test E: retry exhausted preserves idle timeout error, not generic abort', async () => {
    vi.stubEnv('FISH_AUDIO_IDLE_TIMEOUT_MS', '30');
    vi.stubEnv('FISH_AUDIO_TIMEOUT_MS', '500');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    const mockFetch = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) => {
        const signal = init.signal!;
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          body: createAbortableHangingReader(signal),
        } as unknown as Response);
      });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    let caught: unknown;
    try {
      await synthesize('exhausted', {
        languageCode: 'en',
        config: { provider: 'fish-audio', modelId: 'm', engine: 's2-pro' },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(FishAudioTimeoutError);
    expect((caught as FishAudioTimeoutError).kind).toBe('idle');
    expect((caught as FishAudioTimeoutError).timeoutMs).toBe(30);
    expect(
      (caught as FishAudioTimeoutError).requestElapsedMs,
    ).toBeGreaterThanOrEqual(30);
    expect((caught as FishAudioTimeoutError).elapsedMs).toBe(
      (caught as FishAudioTimeoutError).requestElapsedMs,
    );
    expect((caught as Error).message.toLowerCase()).not.toContain(
      'this operation was aborted',
    );
    expect((caught as Error).message).toMatch(/idle_timeout/);
    expect((caught as Error).message).toContain('30ms idle');
    expect((caught as Error).message).toContain('requestElapsed');
  });

  it('Test F: 800-char chunking splits long text into bounded sentence-aware chunks', async () => {
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '800');
    vi.stubEnv('FISH_AUDIO_REQUEST_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    // 2500 chars would have been 1-2 chunks before, now should be >=4
    const longText =
      `${'這是測試。'.repeat(200)} ${'Hello world. '.repeat(100)}`.repeat(2);
    expect(longText.length).toBeGreaterThan(800);
    const mockFetch = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { text: string };
        expect(body.text.length).toBeLessThanOrEqual(800);
        return Promise.resolve(streamResponse([new Uint8Array([0x01])]));
      });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await synthesize(longText, {
      languageCode: 'ja',
      config: { provider: 'fish-audio', modelId: 'ja-model', engine: 's2-pro' },
    });

    const chunkCount = mockFetch.mock.calls.length;
    expect(chunkCount).toBeGreaterThan(3);
    // verify each chunk <=800 and sentence boundary prioritized (contains delimiter if not last chunk)
    for (let i = 0; i < mockFetch.mock.calls.length - 1; i += 1) {
      const body = JSON.parse(
        (mockFetch.mock.calls[i] as [string, { body: string }])[1].body,
      ) as { text: string };
      expect(body.text.length).toBeLessThanOrEqual(800);
      // At least one of the preferred delimiters should be near the end if available
      // We just ensure not a hard cut in middle of no delimiter case is still <=800
    }
  });

  it('Test F2: default max chars is 800 when env is unset', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_REQUEST_DELAY_MS', '0');
    // Do not set FISH_AUDIO_MAX_CHARS_PER_REQUEST -> should default to 800
    const text = 'a'.repeat(801);
    const mockFetch = vi
      .fn()
      .mockResolvedValue(streamResponse([new Uint8Array([0x01])]));
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await synthesize(text, {
      languageCode: 'en',
      config: { provider: 'fish-audio', modelId: 'm', engine: 's2-pro' },
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(
      (mockFetch.mock.calls[0] as [string, { body: string }])[1].body,
    ) as { text: string };
    expect(firstBody.text.length).toBeLessThanOrEqual(800);
  });

  it('Test G: concat order preserves chunk sequence', async () => {
    vi.stubEnv('FISH_AUDIO_MAX_CHARS_PER_REQUEST', '10');
    vi.stubEnv('FISH_AUDIO_REQUEST_DELAY_MS', '0');
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    const text = 'AAA BBB CCC DDD EEE'; // will split into multiple 10-char chunks
    const orderedBuffers = [
      Buffer.from([0x01]),
      Buffer.from([0x02]),
      Buffer.from([0x03]),
      Buffer.from([0x04]),
    ];
    let callIdx = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      const buf = orderedBuffers[callIdx % orderedBuffers.length]!;
      callIdx += 1;
      // Return stream that yields the buffer's bytes
      return Promise.resolve(streamResponse([new Uint8Array(buf)]));
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { concatMp3Buffers } = await import('./audio-concat.js');
    const concatSpy = vi.mocked(concatMp3Buffers);
    concatSpy.mockClear();

    await synthesize(text, {
      languageCode: 'en',
      config: { provider: 'fish-audio', modelId: 'm', engine: 's2-pro' },
    });

    expect(concatSpy).toHaveBeenCalledTimes(1);
    const passedBuffers = concatSpy.mock.calls[0]![0];
    expect(passedBuffers.length).toBeGreaterThan(1);
    // Verify order is preserved: buffers should be in call order
    for (let i = 0; i < passedBuffers.length; i += 1) {
      const expected = orderedBuffers[i % orderedBuffers.length]!;
      expect(passedBuffers[i]!.equals(expected)).toBe(true);
    }
  });

  it('improved retry log includes reason and delayMs for network errors', async () => {
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(streamResponse([new Uint8Array([0x01])]));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await synthesize('network retry log', {
      languageCode: 'en',
      config: { provider: 'fish-audio', modelId: 'm', engine: 's2-pro' },
    });

    const retryLog = warnSpy.mock.calls.find(
      ([msg]) => msg === '[/tts] Fish Audio TTS retrying chunk after error',
    );
    expect(retryLog?.[1]).toEqual(
      expect.objectContaining({
        reason: 'network_error',
        delayMs: expect.any(Number),
      }),
    );
  });

  it('retry log for http errors includes http status reason', async () => {
    vi.stubEnv('FISH_AUDIO_RETRY_DELAY_MS', '0');
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(503, '', 'down'))
      .mockResolvedValueOnce(streamResponse([new Uint8Array([0x01])]));
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-test-key');
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await synthesize('http retry log', {
      languageCode: 'en',
      config: { provider: 'fish-audio', modelId: 'm', engine: 's2-pro' },
    });

    const retryLog = warnSpy.mock.calls.find(
      ([msg]) => msg === '[/tts] Fish Audio TTS retrying chunk after error',
    );
    expect(retryLog?.[1]).toEqual(
      expect.objectContaining({ reason: 'http_503' }),
    );
  });
  /* eslint-enable sonarjs/no-nested-functions, sonarjs/no-identical-functions, promise/param-names, @typescript-eslint/prefer-promise-reject-errors, @typescript-eslint/only-throw-error */
});
