import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildFishAudioCostLine,
  getMetadata,
  synthesize,
} from './fish-audio.js';

function responseFromArray(bytes: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
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

describe('Fish Audio TTS provider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts a script to Fish Audio and returns an MP3 buffer', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        responseFromArray(new Uint8Array([0x49, 0x44, 0x33, 0x04])),
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
    expect(mockFetch).toHaveBeenCalledTimes(1);
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
    } as unknown as Response);
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
});
