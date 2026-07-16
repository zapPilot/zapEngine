import { createHash } from 'node:crypto';
import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';

import sharp from 'sharp';

import {
  abortError,
  combineAbortSignalWithTimeout,
  throwIfAborted,
} from './abort.js';
import type { Slide, SlideSource } from './manifest.js';
import { videoAssetPaths } from './runtime-assets.js';

const MAX_REMOTE_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_REMOTE_IMAGE_PIXELS = 64 * 1024 * 1024;
const MAX_REMOTE_IMAGE_DIMENSION = 16_384;
const MAX_REDIRECTS = 3;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 15_000;
const MIN_FRAMED_LONG_EDGE = 800;
const MIN_FRAMED_SHORT_EDGE = 320;
const MIN_FULL_BLEED_LONG_EDGE = 2_400;
const MIN_FULL_BLEED_SHORT_EDGE = 1_200;

const ALLOWED_IMAGE_CONTENT_TYPES = new Map([
  ['image/avif', 'avif'],
  ['image/jpeg', 'jpeg'],
  ['image/jpg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export type ResolvedSlideAsset =
  | {
      kind: 'image';
      dataUri?: string;
      filePath?: string;
      contentType: string;
      layout: 'fullBleed' | 'framed';
      position: 'center' | 'top' | 'bottom';
      width: number;
      height: number;
      source: SlideSource;
    }
  | {
      kind: 'fallback';
      reason: string;
      source: SlideSource | null;
    };

// `pinnedAddresses` carries the exact addresses that passed the public-IP
// check, so the transport connects to them instead of re-resolving DNS — a
// second independent resolution would reopen the rebinding TOCTOU window.
export type FetchImage = (
  url: string,
  init?: RequestInit & { pinnedAddresses?: readonly string[] },
) => Promise<Response>;

export type ResolveHost = (hostname: string) => Promise<string[]>;

export interface ResolveSlideAssetOptions {
  fetchImage?: FetchImage;
  resolveHost?: ResolveHost;
  workingDirectory?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function findAssetSource(slide: Slide): SlideSource | null {
  if (slide.asset.kind === 'none') return null;
  const sourceId = slide.asset.sourceId;
  return slide.sources.find((source) => source.id === sourceId) ?? null;
}

function toDataUri(contentType: string, buffer: Uint8Array): string {
  return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
}

function injectMapTheme(svg: string, highlightRegionIds: string[]): string {
  const highlightedSelector = highlightRegionIds
    .map((regionId) => `.${regionId}`)
    .join(',');
  const theme = `
.state { fill: #18181b; }
.borders { stroke: #0a0a0a; stroke-width: 2; }
.separator1 { stroke: #52525b; stroke-width: 2; }
${highlightedSelector} { fill: #d4c5a3; }
`;

  if (!svg.includes('</style>')) {
    throw new Error('Bundled US map is missing its style element');
  }
  return svg.replace('</style>', `${theme}</style>`);
}

async function resolveBundledMap(slide: Slide): Promise<ResolvedSlideAsset> {
  if (slide.asset.kind !== 'bundledMap') {
    throw new Error('Expected a bundled map asset');
  }

  const source = findAssetSource(slide);
  if (!source) {
    return { kind: 'fallback', reason: 'Map attribution is missing', source };
  }

  try {
    const originalSvg = await readFile(videoAssetPaths.usStatesMap, 'utf8');
    const themedSvg = injectMapTheme(
      originalSvg,
      slide.asset.highlightRegionIds,
    );
    return {
      kind: 'image',
      dataUri: toDataUri('image/svg+xml', Buffer.from(themedSvg)),
      contentType: 'image/svg+xml',
      layout: 'framed',
      position: 'center',
      width: 959,
      height: 593,
      source,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: 'fallback',
      reason: `Bundled map unavailable: ${message}`,
      source,
    };
  }
}

function isPrivateOrReservedIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function parseIpv6Groups(part: string): number[] | null {
  if (part === '') return [];
  const groups = part.split(':');
  const hextets: number[] = [];
  for (const group of groups) {
    if (group.includes('.')) {
      const octets = group.split('.').map(Number);
      if (
        octets.length !== 4 ||
        octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)
      ) {
        return null;
      }
      hextets.push((octets[0]! << 8) | octets[1]!);
      hextets.push((octets[2]! << 8) | octets[3]!);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    hextets.push(Number.parseInt(group, 16));
  }
  return hextets;
}

// Expand any valid IPv6 literal to its eight numeric hextets so classification
// does not depend on the textual form. A prefix-string check misses expanded
// loopback (0:0:0:0:0:0:0:1) and hex IPv4-mapped literals (::ffff:7f00:1).
function expandIpv6(address: string): number[] | null {
  const zoneless = (address.toLowerCase().split('%', 1)[0] ?? '').trim();
  const halves = zoneless.split('::');
  if (halves.length > 2) return null;

  const head = parseIpv6Groups(halves[0] ?? '');
  const tail = halves.length === 2 ? parseIpv6Groups(halves[1] ?? '') : [];
  if (head === null || tail === null) return null;

  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    return [...head, ...new Array<number>(missing).fill(0), ...tail];
  }
  return head.length === 8 ? head : null;
}

function isPrivateOrReservedIpv6(address: string): boolean {
  const hextets = expandIpv6(address);
  if (hextets === null) return true; // Fail closed on anything unparseable.
  const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  const highBitsZero = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0;
  const isUnspecified = highBitsZero && h5 === 0 && h6 === 0 && h7 === 0;
  const isLoopback = highBitsZero && h5 === 0 && h6 === 0 && h7 === 1;
  if (isUnspecified || isLoopback) return true;

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) addresses embed
  // an IPv4 address in the low 32 bits — classify by the embedded IPv4.
  if (highBitsZero && (h5 === 0xffff || h5 === 0)) {
    const embeddedIpv4 = `${h6 >> 8}.${h6 & 0xff}.${h7 >> 8}.${h7 & 0xff}`;
    return isPrivateOrReservedIpv4(embeddedIpv4);
  }

  if ((h0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((h0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (h0 === 0x2001 && h1 === 0x0db8) return true; // 2001:db8::/32 documentation
  // The following reserved prefixes embed an arbitrary IPv4 that a gateway would
  // translate/route to, so a literal here can smuggle loopback/metadata past the
  // guard. They are never legitimate image hosts — reject the whole range.
  if (h0 === 0x2002) return true; // 2002::/16 6to4
  if (h0 === 0x0064 && h1 === 0xff9b) return true; // 64:ff9b::/96 NAT64
  return false;
}

export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !isPrivateOrReservedIpv4(address);
  if (version === 6) return !isPrivateOrReservedIpv6(address);
  return false;
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
}

// dns.lookup accepts no AbortSignal, so a hung authoritative server would block
// past the download timeout and could not be cancelled on lease loss/shutdown.
// Race the lookup against the signal so it is bounded like every other step.
async function resolveHostWithSignal(
  hostname: string,
  resolveHost: ResolveHost,
  signal: AbortSignal | undefined,
): Promise<string[]> {
  if (!signal) return resolveHost(hostname);
  throwIfAborted(signal);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(abortError(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([resolveHost(hostname), aborted]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

async function resolveAndValidateRemoteUrl(
  url: URL,
  resolveHost: ResolveHost,
  signal: AbortSignal | undefined,
): Promise<string[]> {
  if (url.protocol !== 'https:') {
    throw new Error('Remote image URL must use HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('Remote image URL must not contain credentials');
  }

  const literalAddress = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(literalAddress)
    ? [literalAddress]
    : await resolveHostWithSignal(url.hostname, resolveHost, signal);
  if (
    addresses.length === 0 ||
    addresses.some((address) => !isPublicIpAddress(address))
  ) {
    throw new Error('Remote image URL resolves to a private or reserved IP');
  }
  return addresses;
}

// Socket-level DNS override: whatever hostname the transport asks about, only
// the addresses that already passed the public-IP check are answered. This is
// what closes the rebinding TOCTOU — the connection cannot re-resolve.
export function createPinnedLookup(
  addresses: readonly string[],
): (
  hostname: string,
  options: { all?: boolean },
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) => void {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(
        null,
        addresses.map((address) => ({ address, family: isIP(address) })),
      );
      return;
    }
    const [first] = addresses;
    if (!first) {
      callback(new Error('No pinned addresses available'), '');
      return;
    }
    callback(null, first, isIP(first));
  };
}

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

function toWebResponse(incoming: IncomingMessage): Response {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
    } else if (typeof value === 'string') {
      headers.set(name, value);
    }
  }
  const status = incoming.statusCode ?? 502;
  const body = NULL_BODY_STATUSES.has(status)
    ? null
    : (Readable.toWeb(incoming) as unknown as BodyInit);
  return new Response(body, { status, headers });
}

// Default transport. Global fetch resolves DNS independently at connect time,
// which reopens the TOCTOU window; this fetch connects only to the addresses
// validated by resolveAndValidateRemoteUrl. `hostname` stays the original
// host, so SNI and TLS certificate validation are unaffected by the pin.
export const pinnedFetchImage: FetchImage = async (url, init) => {
  const pinnedAddresses = init?.pinnedAddresses ?? [];
  if (pinnedAddresses.length === 0) {
    throw new Error(
      'Remote image fetch requires pre-validated pinned addresses',
    );
  }
  const target = new URL(url);
  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(
      {
        hostname: target.hostname.replace(/^\[|\]$/g, ''),
        port: target.port === '' ? 443 : Number(target.port),
        path: `${target.pathname}${target.search}`,
        // node:https sends no default User-Agent, and Wikimedia Commons (the
        // planned image source) rejects UA-less requests with HTTP 403.
        headers: {
          'user-agent':
            'zapengine-podcast-pipeline/0.0.1 (https://zap-pilot.org)',
        },
        lookup: createPinnedLookup(pinnedAddresses),
        // No socket pooling: a reused socket could outlive its validation.
        agent: false,
        signal: init?.signal ?? undefined,
      },
      (incoming) => {
        resolve(toWebResponse(incoming));
      },
    );
    request.on('error', reject);
    request.end();
  });
};

function redirectLocation(response: Response): string | null {
  if (![301, 302, 303, 307, 308].includes(response.status)) return null;
  return response.headers.get('location');
}

async function fetchWithSafeRedirects(
  rawUrl: string,
  options: Required<
    Pick<ResolveSlideAssetOptions, 'fetchImage' | 'resolveHost'>
  > & {
    signal: AbortSignal;
  },
): Promise<Response> {
  let url = new URL(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    throwIfAborted(options.signal);
    const pinnedAddresses = await resolveAndValidateRemoteUrl(
      url,
      options.resolveHost,
      options.signal,
    );
    const response = await options.fetchImage(url.href, {
      redirect: 'manual',
      signal: options.signal,
      pinnedAddresses,
    });
    const location = redirectLocation(response);
    if (!location) return response;
    // The redirect body is never read; release its socket before the next hop.
    try {
      await response.body?.cancel();
    } catch {
      // Socket cleanup is best-effort.
    }
    if (redirects === MAX_REDIRECTS) {
      throw new Error(`Image exceeded the ${MAX_REDIRECTS}-redirect limit`);
    }
    url = new URL(location, url);
  }
  throw new Error('Image redirect resolution failed');
}

async function streamResponseToFile(
  response: Response,
  outputPath: string,
  signal: AbortSignal,
): Promise<{ bytes: number; sha256: string }> {
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error('Image exceeds the 25 MiB download limit');
  }
  if (!response.body) throw new Error('Image response body is empty');

  const handle = await open(outputPath, 'wx');
  const reader = response.body.getReader();
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      throwIfAborted(signal);
      const chunk = Buffer.from(value);
      bytes += chunk.byteLength;
      if (bytes > MAX_REMOTE_IMAGE_BYTES) {
        throw new Error('Image exceeds the 25 MiB download limit');
      }
      hash.update(chunk);
      await handle.write(chunk);
    }
  } catch (error) {
    await handle.close();
    await rm(outputPath, { force: true });
    throw error;
  } finally {
    reader.releaseLock();
  }
  await handle.close();
  return { bytes, sha256: hash.digest('hex') };
}

async function downloadRemoteImage(
  url: string,
  outputPath: string,
  options: ResolveSlideAssetOptions,
): Promise<{ contentType: string; sha256: string }> {
  const timeout = combineAbortSignalWithTimeout(
    options.signal,
    options.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS,
    'Image download timed out',
  );
  try {
    const response = await fetchWithSafeRedirects(url, {
      fetchImage: options.fetchImage ?? pinnedFetchImage,
      resolveHost: options.resolveHost ?? defaultResolveHost,
      signal: timeout.signal,
    });
    if (!response.ok) {
      throw new Error(`Image request failed with HTTP ${response.status}`);
    }

    const contentType = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (!contentType || !ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new Error(
        'Remote asset is not an image or uses an unsupported raster format',
      );
    }

    const streamed = await streamResponseToFile(
      response,
      outputPath,
      timeout.signal,
    );
    return { contentType, sha256: streamed.sha256 };
  } catch (error) {
    if (timeout.signal.aborted) throw abortError(timeout.signal);
    throw error;
  } finally {
    timeout.dispose();
  }
}

async function resolveRemoteImage(
  slide: Slide,
  options: ResolveSlideAssetOptions,
): Promise<ResolvedSlideAsset> {
  if (slide.asset.kind !== 'remoteImage') {
    throw new Error('Expected a remote image asset');
  }

  const source = findAssetSource(slide);
  if (!source) {
    return { kind: 'fallback', reason: 'Image attribution is missing', source };
  }

  const ownsDirectory = !options.workingDirectory;
  const workingDirectory =
    options.workingDirectory ??
    (await mkdtemp(join(tmpdir(), 'podcast-slide-image-')));
  await mkdir(workingDirectory, { recursive: true });
  const extension = extname(new URL(slide.asset.url).pathname) || '.image';
  const outputPath = join(workingDirectory, `${slide.id}${extension}`);

  try {
    const { contentType, sha256 } = await downloadRemoteImage(
      slide.asset.url,
      outputPath,
      options,
    );
    if (sha256 !== slide.asset.sha256) {
      throw new Error('Image SHA-256 does not match the manifest');
    }

    const metadata = await sharp(outputPath, {
      failOn: 'error',
      limitInputPixels: MAX_REMOTE_IMAGE_PIXELS,
      animated: false,
    }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Image dimensions could not be read');
    }
    if ((metadata.pages ?? 1) !== 1) {
      throw new Error('Animated or multi-page images are not supported');
    }
    const expectedFormat = ALLOWED_IMAGE_CONTENT_TYPES.get(contentType);
    if (metadata.format !== expectedFormat) {
      throw new Error('Image content type does not match decoded format');
    }
    if (
      metadata.width > MAX_REMOTE_IMAGE_DIMENSION ||
      metadata.height > MAX_REMOTE_IMAGE_DIMENSION ||
      metadata.width * metadata.height > MAX_REMOTE_IMAGE_PIXELS
    ) {
      throw new Error('Image exceeds the safe pixel-dimension limit');
    }

    const longEdge = Math.max(metadata.width, metadata.height);
    const shortEdge = Math.min(metadata.width, metadata.height);
    const requiredLongEdge =
      slide.asset.layout === 'fullBleed'
        ? MIN_FULL_BLEED_LONG_EDGE
        : MIN_FRAMED_LONG_EDGE;
    const requiredShortEdge =
      slide.asset.layout === 'fullBleed'
        ? MIN_FULL_BLEED_SHORT_EDGE
        : MIN_FRAMED_SHORT_EDGE;
    if (longEdge < requiredLongEdge) {
      throw new Error(
        `${slide.asset.layout} image long edge is ${longEdge}px; ${requiredLongEdge}px is required`,
      );
    }
    if (shortEdge < requiredShortEdge) {
      throw new Error(
        `${slide.asset.layout} image short edge is ${shortEdge}px; ${requiredShortEdge}px is required`,
      );
    }

    const dataUri = ownsDirectory
      ? toDataUri(contentType, await readFile(outputPath))
      : undefined;

    return {
      kind: 'image',
      ...(dataUri ? { dataUri } : { filePath: outputPath }),
      contentType,
      layout: slide.asset.layout,
      position: slide.asset.position,
      width: metadata.width,
      height: metadata.height,
      source,
    };
  } catch (error) {
    if (options.signal?.aborted) throw abortError(options.signal);
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: 'fallback',
      reason: `Image fallback: ${message}`,
      source,
    };
  } finally {
    if (ownsDirectory) {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  }
}

export async function resolveSlideAsset(
  slide: Slide,
  fetchImageOrOptions: FetchImage | ResolveSlideAssetOptions = {},
): Promise<ResolvedSlideAsset> {
  const options: ResolveSlideAssetOptions =
    typeof fetchImageOrOptions === 'function'
      ? {
          fetchImage: fetchImageOrOptions,
          // Legacy injected fetches are deterministic test adapters. Avoid a
          // real DNS lookup while still exercising the public-address gate.
          // eslint-disable-next-line sonarjs/no-hardcoded-ip -- deterministic test adapter, not a real host
          resolveHost: async () => ['8.8.8.8'],
        }
      : fetchImageOrOptions;
  throwIfAborted(options.signal);
  if (slide.asset.kind === 'none') {
    return {
      kind: 'fallback',
      reason: 'Source-first editorial card; no photograph used',
      source: slide.sources[0] ?? null,
    };
  }
  if (slide.asset.kind === 'bundledMap') {
    const resolved = await resolveBundledMap(slide);
    if (
      resolved.kind === 'image' &&
      options.workingDirectory &&
      resolved.dataUri
    ) {
      const comma = resolved.dataUri.indexOf(',');
      const outputPath = join(options.workingDirectory, `${slide.id}.svg`);
      await mkdir(options.workingDirectory, { recursive: true });
      await writeFile(
        outputPath,
        Buffer.from(resolved.dataUri.slice(comma + 1), 'base64'),
      );
      return {
        ...resolved,
        dataUri: undefined,
        filePath: outputPath,
      };
    }
    return resolved;
  }
  return resolveRemoteImage(slide, options);
}
