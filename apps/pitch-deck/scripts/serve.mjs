import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const siteDir = join(appDir, 'site');
const port = Number.parseInt(process.env.PORT ?? '3010', 10);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
};

function resolveRequestPath(url) {
  const requestUrl = new URL(url ?? '/', `http://localhost:${port}`);
  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(siteDir, normalizedPath);
  const resolved = resolve(candidate);

  if (resolved !== siteDir && !resolved.startsWith(`${siteDir}${sep}`)) {
    return null;
  }

  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    return join(resolved, 'index.html');
  }

  return resolved;
}

const server = createServer((request, response) => {
  const filePath = resolveRequestPath(request.url);

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, () => {
  console.log(`Pitch deck preview: http://localhost:${port}`);
});
