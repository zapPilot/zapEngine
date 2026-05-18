import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/env.js', () => ({
  getRequiredEnv: vi.fn((key: string) => {
    const env: Record<string, string> = {
      R2_ENDPOINT: 'https://abc.r2.dev',
      R2_ACCESS_KEY_ID: 'key-id',
      R2_SECRET_ACCESS_KEY: 'secret-key',
      R2_BUCKET_NAME: 'test-bucket',
      R2_PUBLIC_BASE_URL: 'https://cdn.example.com/',
    };
    if (key in env) return env[key]!;
    throw new Error(`Unknown env: ${key}`);
  }),
  trimTrailingSlash: vi.fn((v: string) => {
    let end = v.length;
    while (end > 0 && v[end - 1] === '/') {
      end -= 1;
    }
    return v.slice(0, end);
  }),
}));

const mockSend = vi.fn().mockResolvedValue({});

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: vi.fn(),
  S3Client: vi.fn().mockImplementation(function () {
    return {
      send: mockSend,
    };
  }),
}));

import type { HlsFile } from './hls.js';
import { uploadHlsToR2 } from './storage.js';

describe('uploadHlsToR2', () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads files with correct URL format', async () => {
    const files: HlsFile[] = [
      {
        name: 'playlist.m3u8',
        data: Buffer.alloc(50),
        contentType: 'application/vnd.apple.mpegurl',
      },
    ];

    const result = await uploadHlsToR2(files, 'test-id', 'zh-Hant', 'main');

    expect(result).toEqual({
      hlsUrl:
        'https://cdn.example.com/episodes/test-id/localizations/zh-Hant/main/playlist.m3u8',
      r2Prefix: 'episodes/test-id/localizations/zh-Hant/main',
    });
    expect(mockSend).toHaveBeenCalled();
  });
});
