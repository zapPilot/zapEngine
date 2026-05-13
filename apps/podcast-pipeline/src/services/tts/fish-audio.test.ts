import { afterEach, describe, expect, it, vi } from 'vitest';

import { getMetadata, synthesize } from './fish-audio.js';

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

    const result = await synthesize('哈囉，這是 Fish Audio 測試');

    expect(result).toEqual(Buffer.from([0x49, 0x44, 0x33, 0x04]));
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.fish.audio/v1/tts',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer fish-test-key',
          'content-type': 'application/json',
          model: 's2-pro',
        },
      }),
    );

    const [, init] = mockFetch.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({
      text: '哈囉，這是 Fish Audio 測試',
      reference_id: '8957c0744def4b5aafb37103fa8c9efb',
      format: 'mp3',
      mp3_bitrate: 128,
      chunk_length: 200,
      normalize: true,
      latency: 'normal',
    });
  });

  it('throws when FISH_AUDIO_API_KEY is missing', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('FISH_AUDIO_API_KEY', '');

    await expect(synthesize('缺少金鑰')).rejects.toThrow(
      'FISH_AUDIO_API_KEY is required when TTS_PROVIDER=fish-audio',
    );
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
      await synthesize('服務錯誤');
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

  it('builds metadata from Fish Audio env vars', () => {
    vi.stubEnv('FISH_AUDIO_MODEL_ID', 'custom-reference-id');
    vi.stubEnv('FISH_AUDIO_LANGUAGE_CODE', 'ja');

    expect(getMetadata()).toEqual({
      provider: 'fish-audio',
      languageCode: 'ja',
      voiceName: 'custom-reference-id',
    });
  });
});
