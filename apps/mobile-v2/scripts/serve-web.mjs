#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const webRoot = resolve(appRoot, 'dist/web');
const indexPath = join(webRoot, 'index.html');

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

if (
  process.argv.includes('--build') ||
  (process.argv.includes('--build-if-missing') && !existsSync(indexPath))
) {
  const result = spawnSync('pnpm', ['run', 'build:web'], {
    cwd: appRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(indexPath)) {
  console.error(`Missing ${indexPath}. Run pnpm run build:web first.`);
  process.exit(1);
}

const port = Number(argValue('--port', process.env['PORT'] ?? '3100'));
const mimeTypes = new Map([
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

function resolveRequestPath(requestUrl) {
  const pathname = new URL(requestUrl ?? '/', 'http://127.0.0.1').pathname;
  let decodedPath = '/';
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return { status: 400 };
  }

  const normalized = normalize(decodedPath).replace(/^[/\\]+/, '');
  const candidate = resolve(webRoot, normalized);
  if (candidate !== webRoot && !candidate.startsWith(`${webRoot}${sep}`)) {
    return { status: 403 };
  }

  if (
    extname(candidate) &&
    existsSync(candidate) &&
    statSync(candidate).isFile()
  ) {
    return { filePath: candidate };
  }

  if (extname(candidate)) {
    return { status: 404 };
  }

  return { filePath: indexPath };
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }

  const resolvedPath = resolveRequestPath(request.url);
  if ('status' in resolvedPath) {
    response.writeHead(resolvedPath.status).end();
    return;
  }

  const filePath = resolvedPath.filePath;
  response.writeHead(200, {
    'Cache-Control':
      filePath === indexPath
        ? 'no-store'
        : 'public, max-age=31536000, immutable',
    'Content-Type':
      mimeTypes.get(extname(filePath)) ?? 'application/octet-stream',
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${webRoot} at http://127.0.0.1:${port}`);
});
