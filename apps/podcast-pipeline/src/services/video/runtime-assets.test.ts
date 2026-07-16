import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { videoAssetPaths } from './runtime-assets.js';

describe('videoAssetPaths', () => {
  it('resolves every bundled runtime asset to an existing absolute path', async () => {
    const filePaths = [
      videoAssetPaths.notoSansCjkTcRegular,
      videoAssetPaths.notoSansCjkTcBold,
      videoAssetPaths.jetBrainsMonoSemibold,
      videoAssetPaths.logo,
      videoAssetPaths.usStatesMap,
    ];

    expect(isAbsolute(videoAssetPaths.root)).toBe(true);
    expect(isAbsolute(videoAssetPaths.fontsDirectory)).toBe(true);
    expect(filePaths.every(isAbsolute)).toBe(true);
    const fileStats = await Promise.all(filePaths.map((path) => stat(path)));
    expect(fileStats.every((entry) => entry.isFile())).toBe(true);
    expect(fileStats.every((entry) => entry.size > 0)).toBe(true);
    expect((await stat(videoAssetPaths.fontsDirectory)).isDirectory()).toBe(
      true,
    );
  });

  it('uses the same package-relative asset location from source and dist', () => {
    const packageUrl = new URL('../../../', import.meta.url);
    const sourceModuleUrl = new URL(
      'src/services/video/runtime-assets.ts',
      packageUrl,
    );
    const distModuleUrl = new URL(
      'dist/services/video/runtime-assets.js',
      packageUrl,
    );
    const resolveAssets = (moduleUrl: URL): string =>
      new URL('../../../assets/video/', moduleUrl).href;
    const expectedUrl = new URL('assets/video/', packageUrl).href;

    expect(resolveAssets(sourceModuleUrl)).toBe(expectedUrl);
    expect(resolveAssets(distModuleUrl)).toBe(expectedUrl);
    expect(pathToFileURL(videoAssetPaths.root).href).toBe(expectedUrl);
  });
});
