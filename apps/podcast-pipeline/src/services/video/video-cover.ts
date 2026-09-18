import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { acquireRemoteImage } from './assets.js';

/** The cover is the publisher `og:image` selected by the visual plan. */
const VISUAL_PLAN_COVER_STRATEGY = 'visual-plan-og-image-v1' as const;

export type VideoCoverStrategy = typeof VISUAL_PLAN_COVER_STRATEGY;

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
  /** The publisher `og:image` that the visual plan rendered on the lead scene.
   * It is mandatory: rendering must stop rather than silently choose a different
   * thumbnail when the visual plan could not supply it. */
  knownImageUrl?: string | null;
  signal?: AbortSignal;
}

type RenderCoverPng = (
  sourcePath: string,
  outputPath: string,
) => Promise<string>;

interface VideoCoverDependencies {
  acquire: typeof acquireRemoteImage;
  renderPng: RenderCoverPng;
}

const defaultDependencies: VideoCoverDependencies = {
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

async function renderCoverFrom(
  input: PrepareVideoCoverInput,
  dependencies: VideoCoverDependencies,
  imageUrl: string,
): Promise<PreparedVideoCover> {
  const acquired = await dependencies.acquire(imageUrl, {
    workingDirectory: input.workingDirectory,
    filename: 'video-cover-source',
    layout: 'framed',
    allowSmallDimensions: true,
    referer: input.sourceUrl,
    signal: input.signal,
  });
  const outputPath = join(input.workingDirectory, 'video-cover.png');
  const pngSha256 = await dependencies.renderPng(acquired.path, outputPath);
  input.signal?.throwIfAborted();

  return {
    thumbnailPath: outputPath,
    metadata: {
      strategy: VISUAL_PLAN_COVER_STRATEGY,
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
 * Render the exact publisher Open Graph image that the lead content scene used.
 * There is intentionally no scrape-or-renderer fallback here. The visual plan
 * owns the cover decision, and a missing or unusable `og:image` is a failed
 * video attempt rather than permission to ship a different thumbnail.
 */
export async function prepareVideoCover(
  input: PrepareVideoCoverInput,
  overrides: Partial<VideoCoverDependencies> = {},
): Promise<PreparedVideoCover> {
  input.signal?.throwIfAborted();
  const imageUrl = input.knownImageUrl?.trim();
  if (!imageUrl) {
    throw new Error(
      'Video cover requires the publisher og:image selected by the visual plan',
    );
  }
  return renderCoverFrom(
    input,
    { ...defaultDependencies, ...overrides },
    imageUrl,
  );
}
