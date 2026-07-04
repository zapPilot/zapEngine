import { existsSync, statSync } from 'node:fs';
import { extname, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { net, protocol } from 'electron';

export const APP_SCHEME = 'app';
export const APP_HOST = 'bundle';
export const APP_START_URL = `${APP_SCHEME}://${APP_HOST}/`;

/**
 * Must run before app.whenReady(). `standard` gives the scheme an origin
 * (history/pushState work), `supportFetchAPI` + `stream` keep fetch/HLS
 * playback working inside the renderer.
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

export type ResolvedAsset = { filePath: string } | { status: number };

export interface AssetFs {
  exists: (path: string) => boolean;
  isFile: (path: string) => boolean;
}

const nodeFs: AssetFs = {
  exists: (path) => existsSync(path),
  isFile: (path) => statSync(path).isFile(),
};

/**
 * Maps a request pathname onto the static web export. Mirrors the rules of
 * apps/app/scripts/serve-web.mjs exactly:
 * - traversal outside webRoot → 403
 * - has extension and exists → the file
 * - has extension but missing → 404
 * - extensionless (SPA route) → index.html fallback
 */
export function resolveWebAsset(
  webRoot: string,
  pathname: string,
  fs: AssetFs = nodeFs,
): ResolvedAsset {
  const indexPath = resolve(webRoot, 'index.html');

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return { status: 400 };
  }

  if (decodedPath.split(/[/\\]+/).includes('..')) {
    return { status: 403 };
  }

  const normalized = normalize(decodedPath).replace(/^[/\\]+/, '');
  const candidate = resolve(webRoot, normalized);
  if (candidate !== webRoot && !candidate.startsWith(`${webRoot}${sep}`)) {
    return { status: 403 };
  }

  if (extname(candidate)) {
    if (fs.exists(candidate) && fs.isFile(candidate)) {
      return { filePath: candidate };
    }
    return { status: 404 };
  }

  return { filePath: indexPath };
}

/** Call inside app.whenReady(). */
export function registerAppProtocolHandler(webRoot: string): void {
  protocol.handle(APP_SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const resolved = resolveWebAsset(webRoot, pathname);
    if ('status' in resolved) {
      return new Response(null, { status: resolved.status });
    }
    return net.fetch(pathToFileURL(resolved.filePath).toString());
  });
}
