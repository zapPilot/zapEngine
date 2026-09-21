import type { IncomingMessage, ServerResponse } from 'node:http';

import { ANALYTICS_PROXY_PATH } from '../shared/ipc';

declare const __ANALYTICS_ENGINE_URL__: string;

const MAX_BODY_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const PROXY_METHODS = ['GET', 'HEAD', 'POST'];
const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'content-type',
  'authorization',
] as const;
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control'] as const;

export function analyticsUpstreamUrl(): string {
  return typeof __ANALYTICS_ENGINE_URL__ === 'undefined'
    ? ''
    : __ANALYTICS_ENGINE_URL__;
}

/** Only the loopback renderer that owns this server may use the transport. */
function isSameOriginRequest(
  request: IncomingMessage,
  localOrigin: string,
): boolean {
  if (request.headers.host !== new URL(localOrigin).host) {
    return false;
  }
  if (
    request.headers.origin !== undefined &&
    request.headers.origin !== localOrigin
  ) {
    return false;
  }
  return request.headers['sec-fetch-site'] !== 'cross-site';
}

/**
 * Join the configured API origin with the proxy suffix.
 * Concatenation keeps //host and encoded paths on the configured API host.
 */
function buildUpstreamUrl(baseUrl: string, suffix: string): URL | undefined {
  const target = new URL(baseUrl);
  const url = new URL(`${target.href.replace(/\/$/, '')}${suffix}`);
  if (url.origin !== target.origin) {
    return undefined;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return undefined;
  }
  return url;
}

function copyUpstreamRequestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers[name];
    if (typeof value === 'string') {
      headers.set(name, value);
    }
  }
  return headers;
}

async function readBoundedBody(
  request: IncomingMessage,
): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) {
      return undefined;
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function copyUpstreamResponseHeaders(
  upstream: Response,
  response: ServerResponse,
): void {
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) {
      response.setHeader(name, value);
    }
  }
}

/** A same-origin transport for the bundled renderer, never a general URL proxy. */
export async function proxyAnalyticsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  baseUrl: string,
  upstreamFetch: typeof fetch = fetch,
): Promise<void> {
  const localOrigin = `http://127.0.0.1:${request.socket.localPort}`;
  if (!isSameOriginRequest(request, localOrigin)) {
    response.writeHead(403).end();
    return;
  }
  if (!PROXY_METHODS.includes(request.method ?? '')) {
    response.writeHead(405).end();
    return;
  }
  if (!baseUrl) {
    response.writeHead(503).end('Analytics API is not configured');
    return;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  response.once('close', abort);
  const timer = setTimeout(abort, UPSTREAM_TIMEOUT_MS);
  try {
    const suffix = (request.url ?? '').slice(ANALYTICS_PROXY_PATH.length);
    const url = buildUpstreamUrl(baseUrl, suffix);
    if (!url) {
      response.writeHead(400).end();
      return;
    }
    let body: Buffer | undefined;
    if (request.method === 'POST') {
      body = await readBoundedBody(request);
      if (!body) {
        response.writeHead(413).end();
        return;
      }
    }
    const upstream = await upstreamFetch(url, {
      method: request.method,
      headers: copyUpstreamRequestHeaders(request),
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    // Do not forward redirects, cookies, or upstream CORS headers to the renderer.
    if (upstream.status >= 300 && upstream.status < 400) {
      response.writeHead(502).end('Unexpected analytics redirect');
      return;
    }
    copyUpstreamResponseHeaders(upstream, response);
    const data = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status).end(data);
  } catch {
    if (!response.destroyed) {
      response.writeHead(controller.signal.aborted ? 504 : 502).end();
    }
  } finally {
    clearTimeout(timer);
    response.removeListener('close', abort);
  }
}
