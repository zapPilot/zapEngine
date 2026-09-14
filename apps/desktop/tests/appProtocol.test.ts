import { sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type AssetFs, resolveWebAsset } from '../src/main/appProtocol';

const WEB_ROOT = `${sep}srv${sep}web`;

function fakeFs(existingFiles: string[]): AssetFs {
  const files = new Set(existingFiles);
  return {
    isFile: (path) => files.has(path),
  };
}

describe('resolveWebAsset', () => {
  const indexPath = `${WEB_ROOT}${sep}index.html`;

  it('serves an existing file with an extension', () => {
    const fs = fakeFs([`${WEB_ROOT}${sep}app.js`]);
    expect(resolveWebAsset(WEB_ROOT, '/app.js', fs)).toEqual({
      filePath: `${WEB_ROOT}${sep}app.js`,
    });
  });

  it('serves nested assets', () => {
    const asset = `${WEB_ROOT}${sep}_expo${sep}static${sep}js${sep}entry.js`;
    const fs = fakeFs([asset]);
    expect(resolveWebAsset(WEB_ROOT, '/_expo/static/js/entry.js', fs)).toEqual({
      filePath: asset,
    });
  });

  it('404s a missing file that has an extension', () => {
    const fs = fakeFs([]);
    expect(resolveWebAsset(WEB_ROOT, '/missing.png', fs)).toEqual({
      status: 404,
    });
  });

  it('falls back to index.html for extensionless SPA routes', () => {
    const fs = fakeFs([indexPath]);
    expect(resolveWebAsset(WEB_ROOT, '/invest/confirm', fs)).toEqual({
      filePath: indexPath,
    });
    expect(resolveWebAsset(WEB_ROOT, '/', fs)).toEqual({
      filePath: indexPath,
    });
  });

  it('blocks path traversal outside the web root', () => {
    const fs = fakeFs([]);
    expect(resolveWebAsset(WEB_ROOT, '/../secrets.txt', fs)).toEqual({
      status: 403,
    });
    expect(
      resolveWebAsset(WEB_ROOT, '/%2e%2e/%2e%2e/etc/passwd.txt', fs),
    ).toEqual({ status: 403 });
  });

  it('rejects a path resolver result outside the normalized web root', () => {
    const resolvedPaths = [
      WEB_ROOT,
      `${WEB_ROOT}${sep}index.html`,
      `${sep}srv${sep}private${sep}secrets.txt`,
    ];

    expect(
      resolveWebAsset(
        WEB_ROOT,
        '/secrets.txt',
        fakeFs([]),
        () => resolvedPaths.shift()!,
      ),
    ).toEqual({ status: 403 });
  });

  it('treats trailing-separator and canonical web roots equivalently', () => {
    const rootWithTrailingSeparator = `${WEB_ROOT}${sep}`;
    const fs = fakeFs([`${WEB_ROOT}${sep}app.js`]);

    expect(resolveWebAsset(rootWithTrailingSeparator, '/app.js', fs)).toEqual({
      filePath: `${WEB_ROOT}${sep}app.js`,
    });
  });

  it('keeps a resolver-emitted trailing separator as the root prefix', () => {
    const resolvedPaths = [
      `${WEB_ROOT}${sep}`,
      `${WEB_ROOT}${sep}index.html`,
      `${WEB_ROOT}${sep}app.js`,
    ];
    const fs = fakeFs([`${WEB_ROOT}${sep}app.js`]);

    expect(
      resolveWebAsset(WEB_ROOT, '/app.js', fs, () => resolvedPaths.shift()!),
    ).toEqual({ filePath: `${WEB_ROOT}${sep}app.js` });
  });

  it('rejects undecodable percent-encoding with 400', () => {
    const fs = fakeFs([]);
    expect(resolveWebAsset(WEB_ROOT, '/%zz.js', fs)).toEqual({ status: 400 });
  });
});
