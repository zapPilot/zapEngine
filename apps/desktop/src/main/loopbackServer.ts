import { createReadStream } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname } from 'node:path';

import { resolveWebAsset } from './appProtocol';

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

/**
 * Privy-origin fallback (spike path (b)): serve the same web export over
 * 127.0.0.1 so the renderer runs on an http origin that the Privy dashboard
 * accepts. Enabled with ZAP_ELECTRON_LOOPBACK=1; shares resolveWebAsset with
 * the app:// protocol handler so SPA fallback rules stay identical.
 */
export function startLoopbackServer(
  webRoot: string,
  port: number,
): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405).end();
        return;
      }
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const resolved = resolveWebAsset(webRoot, pathname);
      if ('status' in resolved) {
        response.writeHead(resolved.status).end();
        return;
      }
      response.writeHead(200, {
        'Content-Type':
          MIME_TYPES.get(extname(resolved.filePath)) ??
          'application/octet-stream',
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      createReadStream(resolved.filePath).pipe(response);
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}
