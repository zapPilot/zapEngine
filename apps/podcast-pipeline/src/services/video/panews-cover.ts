import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { errorMessage } from '../../lib/errorMessage.js';
import type { ImageCandidate } from '../../types.js';
import { scrapeArticle } from '../scrape.js';
import { acquireRemoteImage } from './assets.js';

const PANEWS_COVER_SCRAPE_TIMEOUT_MS = 15_000;
const PANEWS_COVER_STRATEGY = 'panews-og-image-v1' as const;

export interface PanewsVideoCoverMetadata {
  strategy: typeof PANEWS_COVER_STRATEGY;
  status: 'selected' | 'fallback';
  sourcePageUrl: string;
  sourceImageUrl: string | null;
  storedUrl: string | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  fallbackReason: string | null;
}

export interface PreparedPanewsVideoCover {
  thumbnailPath: string | null;
  metadata: PanewsVideoCoverMetadata;
}

export interface PreparePanewsVideoCoverInput {
  sourceUrl: string;
  workingDirectory: string;
  signal?: AbortSignal;
}

type RenderCoverPng = (
  sourcePath: string,
  outputPath: string,
) => Promise<string>;

interface PanewsCoverDependencies {
  scrape: typeof scrapeArticle;
  acquire: typeof acquireRemoteImage;
  renderPng: RenderCoverPng;
}

const defaultDependencies: PanewsCoverDependencies = {
  scrape: scrapeArticle,
  acquire: acquireRemoteImage,
  renderPng: async (sourcePath, outputPath) => {
    await sharp(sourcePath, {
      failOn: 'error',
      animated: false,
    })
      .rotate()
      .png({ compressionLevel: 9 })
      .toFile(outputPath);
    return createHash('sha256')
      .update(await readFile(outputPath))
      .digest('hex');
  },
};

export function isPanewsArticleUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const panewsHosts = ['panews.io', 'panewslab.com'];
    const isPanewsHost = panewsHosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
    return isPanewsHost && parsed.pathname.split('/').includes('articles');
  } catch {
    return false;
  }
}

function openGraphCover(
  images: readonly ImageCandidate[] | undefined,
): ImageCandidate | null {
  return images?.find((image) => image.origin === 'openGraph') ?? null;
}

function fallbackMetadata(
  sourcePageUrl: string,
  reason: string,
  sourceImageUrl: string | null = null,
): PreparedPanewsVideoCover {
  return {
    thumbnailPath: null,
    metadata: {
      strategy: PANEWS_COVER_STRATEGY,
      status: 'fallback',
      sourcePageUrl,
      sourceImageUrl,
      storedUrl: null,
      sha256: null,
      width: null,
      height: null,
      fallbackReason: reason.slice(0, 400),
    },
  };
}

/**
 * Uses PANews' publisher-selected Open Graph image as the deterministic video
 * cover baseline. The image is acquired through the same SSRF-safe, fully
 * decoded image path as scene assets and converted to a canonical PNG. Any
 * cover-only failure is deliberately fail-open so rendering can keep the
 * renderer-generated thumbnail.
 */
export async function preparePanewsVideoCover(
  input: PreparePanewsVideoCoverInput,
  overrides: Partial<PanewsCoverDependencies> = {},
): Promise<PreparedPanewsVideoCover> {
  input.signal?.throwIfAborted();
  if (!isPanewsArticleUrl(input.sourceUrl)) {
    return fallbackMetadata(input.sourceUrl, 'source-is-not-panews');
  }

  const dependencies = { ...defaultDependencies, ...overrides };
  let candidate: ImageCandidate | null = null;
  try {
    const article = await dependencies.scrape(input.sourceUrl, {
      signal: input.signal,
      timeoutMs: PANEWS_COVER_SCRAPE_TIMEOUT_MS,
    });
    candidate = openGraphCover(article.images);
    if (!candidate) {
      return fallbackMetadata(input.sourceUrl, 'missing-open-graph-image');
    }

    const acquired = await dependencies.acquire(candidate.imageUrl, {
      workingDirectory: input.workingDirectory,
      filename: 'panews-cover-source',
      layout: 'framed',
      signal: input.signal,
    });
    const outputPath = join(input.workingDirectory, 'panews-cover.png');
    const pngSha256 = await dependencies.renderPng(acquired.path, outputPath);
    input.signal?.throwIfAborted();

    return {
      thumbnailPath: outputPath,
      metadata: {
        strategy: PANEWS_COVER_STRATEGY,
        status: 'selected',
        sourcePageUrl: input.sourceUrl,
        sourceImageUrl: candidate.imageUrl,
        storedUrl: null,
        sha256: pngSha256,
        width: acquired.width,
        height: acquired.height,
        fallbackReason: null,
      },
    };
  } catch (error) {
    input.signal?.throwIfAborted();
    return fallbackMetadata(
      input.sourceUrl,
      errorMessage(error),
      candidate?.imageUrl ?? null,
    );
  }
}
