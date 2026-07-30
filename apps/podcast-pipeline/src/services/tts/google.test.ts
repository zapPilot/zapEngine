import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSynthesize, mockTextToSpeechClient } = vi.hoisted(() => ({
  mockSynthesize: vi.fn(),
  mockTextToSpeechClient: vi.fn(),
}));

vi.mock('@google-cloud/text-to-speech', () => ({
  TextToSpeechClient: mockTextToSpeechClient.mockImplementation(function () {
    return {
      synthesizeSpeech: mockSynthesize,
    };
  }),
}));

vi.mock('fluent-ffmpeg', () => {
  const chain = {
    setFfmpegPath: vi.fn().mockReturnThis(),
    input: vi.fn().mockReturnThis(),
    complexFilter: vi.fn().mockReturnThis(),
    on: vi.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === 'end' || event === 'error') {
        queueMicrotask(cb);
      }
      return chain;
    }),
    save: vi.fn().mockReturnThis(),
    audioCodec: vi.fn().mockReturnThis(),
    audioBitrate: vi.fn().mockReturnThis(),
    format: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
  };
  const mockDefault = vi.fn(() => chain) as unknown as typeof chain & {
    setFfmpegPath: typeof chain.setFfmpegPath;
  };
  mockDefault.setFfmpegPath = vi.fn().mockReturnThis();
  return { default: mockDefault };
});

vi.mock('@ffmpeg-installer/ffmpeg', () => ({ path: '/usr/bin/ffmpeg' }));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock('os', () => ({ tmpdir: vi.fn().mockReturnValue('/tmp') }));

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('mock-uuid-456'),
}));

import {
  buildGoogleCostLine,
  splitTextIntoChunks,
  synthesize as textToSpeech,
  synthesizeChunk,
} from './google.js';

describe('Google TTS client credentials', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockTextToSpeechClient.mockClear();
  });

  it('passes base64 service account credentials to the TTS client', async () => {
    const credentials = {
      client_email: 'tts@example.iam.gserviceaccount.com',
      private_key:
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
      project_id: 'test-project',
    };
    vi.stubEnv(
      'GOOGLE_APPLICATION_CREDENTIALS_BASE64',
      Buffer.from(JSON.stringify(credentials), 'utf8').toString('base64'),
    );
    mockSynthesize.mockResolvedValue([{ audioContent: new Uint8Array(1024) }]);

    await synthesizeChunk('Test speech text');

    expect(mockTextToSpeechClient).toHaveBeenCalledWith({
      credentials,
      projectId: 'test-project',
    });
  });
});

describe('textToSpeech', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSynthesize.mockResolvedValue([{ audioContent: new Uint8Array(1024) }]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    mockSynthesize.mockClear();
  });

  it('throws when text is empty', async () => {
    await expect(textToSpeech('')).rejects.toThrow('No text to synthesize');
  });

  it('throws when text contains only whitespace', async () => {
    await expect(textToSpeech('   ')).rejects.toThrow('No text to synthesize');
  });

  it('uses default voice when no opts provided', async () => {
    const result = await textToSpeech('Hello');
    expect(result.audio).toBeInstanceOf(Buffer);
    expect(result.cost[0]?.model).toBe('cmn-TW-Wavenet-A');
  });

  it('includes $metadata in error details when present', async () => {
    mockSynthesize.mockRejectedValue(
      Object.assign(new Error('gRPC error'), {
        code: 13,
        $metadata: { internalRepr: new Map([['key', 'val']]) },
      }),
    );

    await expect(textToSpeech('Test')).rejects.toThrow(
      'Google TTS chunk 1/1 failed',
    );
  });

  it('includes $metadata string details when not a record', async () => {
    mockSynthesize.mockRejectedValue(
      Object.assign(new Error('gRPC error'), {
        code: 13,
        $metadata: 'raw metadata string',
      }),
    );

    await expect(textToSpeech('Test')).rejects.toThrow(
      'Google TTS chunk 1/1 failed',
    );
  });

  it('handles non-record errors in error details', async () => {
    mockSynthesize.mockRejectedValue('string error');

    await expect(textToSpeech('Test')).rejects.toThrow(
      'Google TTS chunk 1/1 failed',
    );
  });

  it('handles errors with string code in diagnostics', async () => {
    mockSynthesize.mockRejectedValue(
      Object.assign(new Error('gRPC error'), { code: '13' }),
    );

    await expect(textToSpeech('Test')).rejects.toThrow(
      'Google TTS chunk 1/1 failed',
    );
  });

  it('handles errors with details but no metadata', async () => {
    mockSynthesize.mockRejectedValue(
      Object.assign(new Error('gRPC error'), {
        code: 13,
        details: 'some details',
      }),
    );

    await expect(textToSpeech('Test')).rejects.toThrow(
      'Google TTS chunk 1/1 failed',
    );
  });

  it('retries transient Google error with string code', async () => {
    mockSynthesize
      .mockRejectedValueOnce(
        Object.assign(new Error('13 INTERNAL'), { code: '13' }),
      )
      .mockResolvedValueOnce([{ audioContent: new Uint8Array(512) }]);

    const result = await textToSpeech('Test');
    expect(result.audio).toBeInstanceOf(Buffer);
    expect(mockSynthesize).toHaveBeenCalledTimes(2);
  });

  it('handles non-record errors in copyGoogleErrorMetadata', async () => {
    mockSynthesize.mockRejectedValue('plain string error');

    await expect(textToSpeech('Test')).rejects.toThrow(
      'Google TTS chunk 1/1 failed',
    );
  });

  it('handles metadata with circular reference in formatGrpcMetadata', async () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    mockSynthesize.mockRejectedValue(
      Object.assign(new Error('gRPC error'), {
        code: 13,
        metadata: circular,
      }),
    );

    await expect(textToSpeech('Test')).rejects.toThrow(
      'Google TTS chunk 1/1 failed',
    );
  });

  it('handles $metadata with circular reference in formatGrpcMetadata', async () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    mockSynthesize.mockRejectedValue(
      Object.assign(new Error('gRPC error'), {
        code: 13,
        $metadata: circular,
      }),
    );

    await expect(textToSpeech('Test')).rejects.toThrow(
      'Google TTS chunk 1/1 failed',
    );
  });

  it('synthesizes single chunk directly', async () => {
    const result = await textToSpeech('短文字');
    expect(result.audio).toBeInstanceOf(Buffer);
    expect(result.audio.length).toBeGreaterThan(0);
    expect(result.cost).toEqual([
      {
        category: 'tts',
        label: 'TTS audio',
        provider: 'google',
        model: 'cmn-TW-Wavenet-A',
        costUsd: 0.000012,
        usage: {
          unit: 'characters',
          quantity: 3,
          unitPriceUsd: 0.000004,
        },
      },
    ]);
  });

  it('handles Chinese text with period punctuation', async () => {
    const result = await textToSpeech(
      '這是一段很長的文字內容。這是第二句話。這是第三句話。',
    );
    expect(result.audio).toBeInstanceOf(Buffer);
  });

  it('handles mixed ASCII and CJK characters', async () => {
    const result = await textToSpeech('Hello 你好 World 世界 123。');
    expect(result.audio).toBeInstanceOf(Buffer);
  });

  it('uses custom Google voice options from resolved language config', async () => {
    const result = await textToSpeech('Hello world', {
      languageCode: 'en',
      usage: 'main',
      config: {
        provider: 'google',
        languageCode: 'en-US',
        voiceName: 'en-US-Wavenet-A',
      },
      costLabel: 'TTS main audio',
    });

    expect(result.audio).toBeInstanceOf(Buffer);
    expect(result.cost).toEqual([
      expect.objectContaining({
        label: 'TTS main audio',
        provider: 'google',
        model: 'en-US-Wavenet-A',
      }),
    ]);
    expect(mockSynthesize).toHaveBeenCalledWith({
      input: { text: 'Hello world' },
      voice: {
        languageCode: 'en-US',
        name: 'en-US-Wavenet-A',
      },
      audioConfig: { audioEncoding: 'MP3' },
    });
  });

  it('accepts a classroom language option with its configured Google voice mapping', async () => {
    const result = await textToSpeech('こんにちは', {
      languageCode: 'ja',
      usage: 'classroom',
      config: {
        provider: 'google',
        languageCode: 'ja-JP',
        voiceName: 'ja-JP-Wavenet-A',
      },
      costLabel: 'TTS classroom audio',
    });

    expect(result.audio).toBeInstanceOf(Buffer);
    expect(result.cost).toEqual([
      expect.objectContaining({
        label: 'TTS classroom audio',
        provider: 'google',
        model: 'ja-JP-Wavenet-A',
      }),
    ]);
    expect(mockSynthesize).toHaveBeenCalledWith({
      input: { text: 'こんにちは' },
      voice: expect.objectContaining({
        languageCode: 'ja-JP',
        name: 'ja-JP-Wavenet-A',
      }),
      audioConfig: { audioEncoding: 'MP3' },
    });
  });

  it('splits text into multiple chunks and sums character cost', async () => {
    const { readFileSync } = await import('node:fs');
    vi.mocked(readFileSync).mockReturnValue(Buffer.alloc(200));

    const longText = 'a'.repeat(6000);
    const result = await textToSpeech(longText);
    expect(result.audio).toBeInstanceOf(Buffer);
    expect(mockSynthesize).toHaveBeenCalledTimes(2);
    expect(result.cost[0]).toEqual(
      expect.objectContaining({
        costUsd: 0.024,
        usage: {
          unit: 'characters',
          quantity: 6000,
          unitPriceUsd: 0.000004,
        },
      }),
    );
  });

  it('throws when synthesize returns empty audio content', async () => {
    mockSynthesize.mockResolvedValue([{ audioContent: null }]);
    await expect(textToSpeech('Test')).rejects.toThrow(
      'Google TTS returned empty audio content',
    );
  });

  it('includes chunk diagnostics when Google TTS fails', async () => {
    mockSynthesize.mockRejectedValue(
      Object.assign(new Error('13 INTERNAL: Internal error encountered.'), {
        code: 13,
        details: 'Internal error encountered.',
        metadata: { getMap: () => ({ request: 'abc' }) },
      }),
    );

    const result = textToSpeech('Test');

    await expect(result).rejects.toMatchObject({
      message: expect.stringContaining(
        'Google TTS chunk 1/1 failed: 13 INTERNAL: Internal error encountered.',
      ),
      cause: expect.objectContaining({
        code: 13,
        details: 'Internal error encountered.',
      }),
    });
    await expect(result).rejects.toThrow(
      'voice=cmn-TW-Wavenet-A language=cmn-TW bytes=4 chars=4',
    );
    expect(mockSynthesize).toHaveBeenCalledTimes(3);
  });

  it('retries a transient Google INTERNAL error', async () => {
    mockSynthesize
      .mockRejectedValueOnce(
        Object.assign(new Error('13 INTERNAL: Internal error encountered.'), {
          code: 13,
        }),
      )
      .mockResolvedValueOnce([{ audioContent: new Uint8Array(512) }]);

    const result = await textToSpeech('Test');

    expect(result.audio).toBeInstanceOf(Buffer);
    expect(mockSynthesize).toHaveBeenCalledTimes(2);
  });

  it('synthesizes multiple chunks via Promise.all and concatenates', async () => {
    vi.mocked(mockSynthesize).mockResolvedValue([
      { audioContent: new Uint8Array(512) },
    ]);

    const longText = '这是测试文本。'.repeat(2000);
    const result = await textToSpeech(longText);

    expect(result.audio).toBeInstanceOf(Buffer);
    expect(mockSynthesize).toHaveBeenCalled();
    const callCount = mockSynthesize.mock.calls.length;
    expect(callCount).toBeGreaterThan(1);
  });
});

describe('getGoogleVoiceOptions', () => {
  it('throws when opts.config.provider is not google', async () => {
    await expect(
      textToSpeech('test', {
        languageCode: 'ja',
        usage: 'main',
        config: {
          provider: 'fish-audio',
          modelId: 'custom-model',
          engine: 's1',
        } as never,
      }),
    ).rejects.toThrow('Google TTS received fish-audio language config');
  });
});

describe('buildGoogleCostLine', () => {
  it('estimates Wavenet cost from Unicode character count across chunks', () => {
    expect(
      buildGoogleCostLine(['Hello', '世界'], {
        languageCode: 'en-US',
        voiceName: 'en-US-Wavenet-A',
      }),
    ).toEqual({
      category: 'tts',
      label: 'TTS audio',
      provider: 'google',
      model: 'en-US-Wavenet-A',
      costUsd: 0.000028,
      usage: {
        unit: 'characters',
        quantity: 7,
        unitPriceUsd: 0.000004,
      },
    });
  });
});

describe('splitTextIntoChunks', () => {
  it('returns empty array for empty text', () => {
    expect(splitTextIntoChunks('', 4800)).toEqual([]);
  });

  it('returns single chunk when text fits', () => {
    const chunks = splitTextIntoChunks('短文字', 4800);
    expect(chunks).toHaveLength(1);
  });

  it('splits on Chinese period punctuation', () => {
    const chunks = splitTextIntoChunks('第一句。第二句。第三句。', 4800);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.join('')).toContain('第一句');
    expect(chunks.join('')).toContain('第二句');
  });

  it('handles single very long sentence by char splitting', () => {
    const longSentence = '很長的句子沒有標點符號。';
    const chunks = splitTextIntoChunks(longSentence.repeat(200), 4800);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('discards empty chunks', () => {
    const chunks = splitTextIntoChunks('句子一。句子二。', 4800);
    chunks.forEach((c) => expect(c.trim()).not.toBe(''));
  });

  it('splits single very long word character-by-character when exceeds maxBytes', () => {
    const longWord = 'a'.repeat(6000);
    const chunks = splitTextIntoChunks(longWord, 4800);
    expect(chunks.length).toBeGreaterThan(1);
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    expect(totalLength).toBe(longWord.length);
  });

  it('handles text with only punctuation marks', () => {
    const chunks = splitTextIntoChunks('。！？', 4800);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('synthesizeChunk', () => {
  beforeEach(() => {
    mockSynthesize.mockResolvedValue([{ audioContent: new Uint8Array(1024) }]);
  });

  it('calls TTS client with correct parameters', async () => {
    const result = await synthesizeChunk('Test speech text');
    expect(result).toBeInstanceOf(Buffer);
    expect(mockSynthesize).toHaveBeenCalledWith({
      input: { text: 'Test speech text' },
      voice: expect.objectContaining({
        languageCode: 'cmn-TW',
        name: 'cmn-TW-Wavenet-A',
      }),
      audioConfig: { audioEncoding: 'MP3' },
    });
  });
});
