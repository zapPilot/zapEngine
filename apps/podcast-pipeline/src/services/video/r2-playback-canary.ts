import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface R2PlaybackCanaryReport {
  url: string;
  status: 206;
  contentRange: string;
  corsOrigin: string;
}

type FetchPlaybackRange = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

const DEFAULT_CANARY_ORIGIN = 'https://zappilot.ai';

export async function assertR2PlaybackReady(
  rawUrl: string,
  options: {
    origin?: string;
    fetchRange?: FetchPlaybackRange;
  } = {},
): Promise<R2PlaybackCanaryReport> {
  const url = parseProductionPlaybackUrl(rawUrl);
  const origin = options.origin ?? DEFAULT_CANARY_ORIGIN;
  const response = await (options.fetchRange ?? fetch)(url.href, {
    method: 'GET',
    headers: {
      Origin: origin,
      Range: 'bytes=0-1',
    },
  });

  try {
    if (response.status !== 206) {
      throw new Error(
        `R2 playback range request returned ${response.status}; expected 206`,
      );
    }

    const contentRange = response.headers.get('content-range')?.trim() ?? '';
    if (!/^bytes 0-1\/(?:\d+|\*)$/i.test(contentRange)) {
      throw new Error(
        `R2 playback response has invalid Content-Range: ${contentRange || 'missing'}`,
      );
    }

    const corsOrigin =
      response.headers.get('access-control-allow-origin')?.trim() ?? '';
    if (corsOrigin !== '*' && corsOrigin !== origin) {
      throw new Error(
        `R2 playback response does not allow CORS origin ${origin}`,
      );
    }

    return {
      url: url.href,
      status: 206,
      contentRange,
      corsOrigin,
    };
  } finally {
    await response.body?.cancel().catch(() => {});
  }
}

export async function runR2PlaybackCanaryCli(
  argv: string[],
  log: (message: string) => void = console.log,
): Promise<void> {
  const [url, ...extra] = argv;
  if (!url || extra.length > 0) {
    throw new Error('Usage: video:r2-canary <public-video-mp4-url>');
  }

  const report = await assertR2PlaybackReady(url);
  log(
    `R2 playback ready: ${report.status} ${report.contentRange} CORS=${report.corsOrigin}`,
  );
}

function parseProductionPlaybackUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('R2 playback canary requires a valid public HTTPS URL');
  }

  if (url.protocol !== 'https:') {
    throw new Error('R2 playback canary requires a public HTTPS URL');
  }
  if (url.hostname.toLowerCase().endsWith('.r2.dev')) {
    throw new Error('R2 playback canary must use the production public domain');
  }
  return url;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    await runR2PlaybackCanaryCli(process.argv.slice(2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
