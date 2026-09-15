import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { errorMessage } from '../../lib/errorMessage.js';
import type { ImageCandidate } from '../../types.js';
import { scrapeArticle } from '../scrape.js';
import { acquireRemoteImage } from './assets.js';

const COVER_SCRAPE_TIMEOUT_MS = 15_000;
/** The cover was chosen by the visual plan, so the article is never fetched:
 * the first content scene already rendered this exact URL. */
const VISUAL_PLAN_COVER_STRATEGY = 'visual-plan-og-image-v1' as const;
/** No plan said which image to use, so the cover finds the publisher's
 * `og:image` itself. Only PANews articles are scraped on this path. */
const SCRAPED_COVER_STRATEGY = 'panews-og-image-v1' as const;

export type VideoCoverStrategy =
  | typeof VISUAL_PLAN_COVER_STRATEGY
  | typeof SCRAPED_COVER_STRATEGY;

export interface VideoCoverMetadata {
  strategy: VideoCoverStrategy;
  status: 'selected' | 'fallback';
  sourcePageUrl: string;
  sourceImageUrl: string | null;
  storedUrl: string | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  fallbackReason: string | null;
}

export interface PreparedVideoCover {
  thumbnailPath: string | null;
  metadata: VideoCoverMetadata;
}

export interface PrepareVideoCoverInput {
  sourceUrl: string;
  workingDirectory: string;
  /** The `og:image` the visual plan recorded for the lead content scene. When
   * present it decides the cover outright, which is what keeps the thumbnail a
   * viewer clicks and the first frame they then see on one image. */
  knownImageUrl?: string | null;
  signal?: AbortSignal;
}

type RenderCoverPng = (
  sourcePath: string,
  outputPath: string,
) => Promise<string>;

interface VideoCoverDependencies {
  scrape: typeof scrapeArticle;
  acquire: typeof acquireRemoteImage;
  renderPng: RenderCoverPng;
}

const defaultDependencies: VideoCoverDependencies = {
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
  strategy: VideoCoverStrategy,
  sourcePageUrl: string,
  reason: string,
  sourceImageUrl: string | null = null,
): PreparedVideoCover {
  return {
    thumbnailPath: null,
    metadata: {
      strategy,
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

async function renderCoverFrom(
  input: PrepareVideoCoverInput,
  dependencies: VideoCoverDependencies,
  strategy: VideoCoverStrategy,
  imageUrl: string,
): Promise<PreparedVideoCover> {
  const acquired = await dependencies.acquire(imageUrl, {
    workingDirectory: input.workingDirectory,
    filename: 'video-cover-source',
    layout: 'framed',
    signal: input.signal,
  });
  const outputPath = join(input.workingDirectory, 'video-cover.png');
  const pngSha256 = await dependencies.renderPng(acquired.path, outputPath);
  input.signal?.throwIfAborted();

  return {
    thumbnailPath: outputPath,
    metadata: {
      strategy,
      status: 'selected',
      sourcePageUrl: input.sourceUrl,
      sourceImageUrl: imageUrl,
      storedUrl: null,
      sha256: pngSha256,
      width: acquired.width,
      height: acquired.height,
      fallbackReason: null,
    },
  };
}

/**
 * The publisher's own Open Graph image, rendered as the deterministic video
 * cover. It is acquired through the same SSRF-safe, fully decoded image path as
 * scene assets and converted to a canonical PNG.
 *
 * A plan that recorded the image its lead scene rendered decides the cover
 * outright — the article is not fetched again, so three language renders of one
 * episode cannot drift apart or away from their own first frame. Only a payload
 * written before the plan carried that field falls back to scraping, and only
 * for PANews. Any cover-only failure is deliberately fail-open so rendering can
 * keep the renderer-generated thumbnail.
 */
export async function prepareVideoCover(
  input: PrepareVideoCoverInput,
  overrides: Partial<VideoCoverDependencies> = {},
): Promise<PreparedVideoCover> {
  input.signal?.throwIfAborted();
  const dependencies = { ...defaultDependencies, ...overrides };
  const planned = input.knownImageUrl;
  if (planned) {
    try {
      return await renderCoverFrom(
        input,
        dependencies,
        VISUAL_PLAN_COVER_STRATEGY,
        planned,
      );
    } catch (error) {
      input.signal?.throwIfAborted();
      return fallbackMetadata(
        VISUAL_PLAN_COVER_STRATEGY,
        input.sourceUrl,
        errorMessage(error),
        planned,
      );
    }
  }

  if (!isPanewsArticleUrl(input.sourceUrl)) {
    return fallbackMetadata(
      SCRAPED_COVER_STRATEGY,
      input.sourceUrl,
      'source-is-not-panews',
    );
  }

  let candidate: ImageCandidate | null = null;
  try {
    const article = await dependencies.scrape(input.sourceUrl, {
      signal: input.signal,
      timeoutMs: COVER_SCRAPE_TIMEOUT_MS,
    });
    candidate = openGraphCover(article.images);
    if (!candidate) {
      return fallbackMetadata(
        SCRAPED_COVER_STRATEGY,
        input.sourceUrl,
        'missing-open-graph-image',
      );
    }
    return await renderCoverFrom(
      input,
      dependencies,
      SCRAPED_COVER_STRATEGY,
      candidate.imageUrl,
    );
  } catch (error) {
    input.signal?.throwIfAborted();
    return fallbackMetadata(
      SCRAPED_COVER_STRATEGY,
      input.sourceUrl,
      errorMessage(error),
      candidate?.imageUrl ?? null,
    );
  }
}
