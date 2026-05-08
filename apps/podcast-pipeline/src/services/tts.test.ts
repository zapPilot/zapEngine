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
        setTimeout(cb, 0);
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
  concatenateAudioChunks,
  getClientOptions,
  splitTextIntoChunks,
  synthesizeChunk,
  textToSpeech,
} from './tts.js';

describe('Google credentials', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockTextToSpeechClient.mockClear();
  });

  it('returns undefined when GOOGLE_APPLICATION_CREDENTIALS_BASE64 is not set', () => {
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS_BASE64', '');
    expect(getClientOptions()).toBeUndefined();
  });

  it('uses GOOGLE_APPLICATION_CREDENTIALS as a credentials file path fallback', () => {
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS_BASE64', '');
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '/secrets/google-sa.json');

    expect(getClientOptions()).toEqual({
      keyFilename: '/secrets/google-sa.json',
    });
  });

  it('throws when GOOGLE_APPLICATION_CREDENTIALS_BASE64 is not valid base64', () => {
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS_BASE64', 'not-valid-base64!!!');
    expect(() => getClientOptions()).toThrow(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: expected base64-encoded service account JSON',
    );
  });

  it('throws when service account JSON is missing client_email', () => {
    const credentials = {
      private_key:
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
      project_id: 'test-project',
    };
    vi.stubEnv(
      'GOOGLE_APPLICATION_CREDENTIALS_BASE64',
      Buffer.from(JSON.stringify(credentials), 'utf8').toString('base64'),
    );
    expect(() => getClientOptions()).toThrow(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: service account JSON must include client_email, private_key, and project_id',
    );
  });

  it('throws when service account JSON is missing private_key', () => {
    const credentials = {
      client_email: 'tts@example.iam.gserviceaccount.com',
      project_id: 'test-project',
    };
    vi.stubEnv(
      'GOOGLE_APPLICATION_CREDENTIALS_BASE64',
      Buffer.from(JSON.stringify(credentials), 'utf8').toString('base64'),
    );
    expect(() => getClientOptions()).toThrow(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: service account JSON must include client_email, private_key, and project_id',
    );
  });

  it('throws when service account JSON is missing project_id', () => {
    const credentials = {
      client_email: 'tts@example.iam.gserviceaccount.com',
      private_key:
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
    };
    vi.stubEnv(
      'GOOGLE_APPLICATION_CREDENTIALS_BASE64',
      Buffer.from(JSON.stringify(credentials), 'utf8').toString('base64'),
    );
    expect(() => getClientOptions()).toThrow(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: service account JSON must include client_email, private_key, and project_id',
    );
  });

  it('builds TTS client options from base64 service account JSON', () => {
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

    expect(getClientOptions()).toEqual({
      credentials,
      projectId: 'test-project',
    });
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

  it('synthesizes single chunk directly', async () => {
    const result = await textToSpeech('短文字');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles Chinese text with period punctuation', async () => {
    const result = await textToSpeech(
      '這是一段很長的文字內容。這是第二句話。這是第三句話。',
    );
    expect(result).toBeInstanceOf(Buffer);
  });

  it('handles mixed ASCII and CJK characters', async () => {
    const result = await textToSpeech('Hello 你好 World 世界 123。');
    expect(result).toBeInstanceOf(Buffer);
  });

  it('uses custom language code from env', async () => {
    vi.stubEnv('GOOGLE_TTS_LANGUAGE_CODE', 'en-US');
    vi.stubEnv('GOOGLE_TTS_VOICE_NAME', 'en-US-Wavenet-A');
    const result = await textToSpeech('Hello world');
    expect(result).toBeInstanceOf(Buffer);
  });

  it('splits text into multiple chunks when needed', async () => {
    const longText =
      '第一章內容。這是第二章內容。這是第三章內容。這是第四章內容。這是第五章內容。';
    const result = await textToSpeech(longText);
    expect(result).toBeInstanceOf(Buffer);
    expect(mockSynthesize).toHaveBeenCalled();
  });

  it('throws when synthesize returns empty audio content', async () => {
    mockSynthesize.mockResolvedValue([{ audioContent: null }]);
    await expect(textToSpeech('Test')).rejects.toThrow(
      'Google TTS returned empty audio content',
    );
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

describe('concatenateAudioChunks', () => {
  it('returns single chunk unchanged', async () => {
    const buf = Buffer.alloc(100);
    const result = await concatenateAudioChunks([buf]);
    expect(result).toBe(buf);
  });

  it('concatenates multiple chunks using ffmpeg with dynamic fs import', async () => {
    const { readFileSync } = await import('node:fs');
    vi.mocked(readFileSync).mockReturnValue(Buffer.alloc(200));

    const { concatenateAudioChunks: concat } = await import('./tts.js');
    const chunks = [Buffer.alloc(100, 0x01), Buffer.alloc(100, 0x02)];
    const result = await concat(chunks);
    expect(result).toBeInstanceOf(Buffer);
  });

  it('swallows error when unlinkSync throws on input file deletion', async () => {
    const { readFileSync, unlinkSync } = await import('node:fs');
    vi.mocked(readFileSync).mockReturnValue(Buffer.alloc(300));
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error('unlink input file error');
    });

    const { concatenateAudioChunks: concat } = await import('./tts.js');
    const chunks = [Buffer.alloc(100, 0x01), Buffer.alloc(100, 0x02)];
    const result = await concat(chunks);
    expect(result).toBeInstanceOf(Buffer);
  });

  it('swallows error when unlinkSync throws on output file deletion', async () => {
    let inputUnlinkCalled = false;
    const { readFileSync, unlinkSync } = await import('node:fs');
    vi.mocked(readFileSync).mockReturnValue(Buffer.alloc(300));
    vi.mocked(unlinkSync).mockImplementation(() => {
      if (!inputUnlinkCalled) {
        inputUnlinkCalled = true;
        // First calls are for input files - succeed
        return;
      }
      // Subsequent call for output file - throw
      throw new Error('unlink output file error');
    });

    const { concatenateAudioChunks: concat } = await import('./tts.js');
    const chunks = [Buffer.alloc(100, 0x01), Buffer.alloc(100, 0x02)];
    const result = await concat(chunks);
    expect(result).toBeInstanceOf(Buffer);
  });

  it('concatenates multiple chunks (3+) with ffmpeg', async () => {
    const { readFileSync } = await import('node:fs');
    vi.mocked(readFileSync).mockReturnValue(Buffer.alloc(400));

    const { concatenateAudioChunks: concat } = await import('./tts.js');
    const chunks = [
      Buffer.alloc(100, 0x01),
      Buffer.alloc(100, 0x02),
      Buffer.alloc(100, 0x03),
    ];
    const result = await concat(chunks);
    expect(result).toBeInstanceOf(Buffer);
  });
});
