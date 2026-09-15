import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { uploadHlsToR2 } from './storage.js';
import { replaceHls } from './storage-hls.js';
vi.mock('./storage-hls.js', () => ({
  replaceHls: vi.fn().mockResolvedValue(undefined),
}));
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    R2_ENDPOINT: 'https://r2.test',
    R2_ACCESS_KEY_ID: 'id',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET_NAME: 'bucket',
    R2_PUBLIC_BASE_URL: 'https://cdn.test/',
  }))
    vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  ['main', undefined, 'main'],
  ['classroom', undefined, 'classroom'],
  ['classroom', 'ja', 'classroom/ja'],
] as const)(
  'keeps the %s/%s public playlist URL and scopes cleanup correctly',
  async (section, target, suffix) => {
    const result = await uploadHlsToR2([], 'ep', 'zh-Hant', section, target);
    const prefix = `episodes/ep/localizations/zh-Hant/${suffix}`;
    expect(result).toEqual({
      hlsUrl: `https://cdn.test/${prefix}/playlist.m3u8`,
      r2Prefix: prefix,
    });
    expect(replaceHls).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'bucket',
        prefix,
        put: expect.any(Function),
      }),
    );
  },
);
it('rejects invalid main/classroom combinations before replacing anything', async () => {
  await expect(
    uploadHlsToR2([], 'ep', 'zh-Hant', 'main', 'ja'),
  ).rejects.toThrow('only valid');
  expect(replaceHls).not.toHaveBeenCalled();
});
