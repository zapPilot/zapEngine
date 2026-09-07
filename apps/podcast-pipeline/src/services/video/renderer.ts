import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import sharp from 'sharp';

import { throwIfAborted } from './abort.js';
import { type ResolvedSlideAsset, resolveSlideAsset } from './assets.js';
import {
  MEDIA_MOTION_SUPERSAMPLE,
  renderVerticalSlideVideo,
} from './ffmpeg-video.js';
import {
  parseVerticalVideoManifest,
  type Slide,
  type VerticalVideoManifest,
} from './manifest.js';
import {
  cropMediaImage,
  rasterizeBrandFrame,
  rasterizeOutro,
} from './rasterizer.js';
import { bgmTrackPath, videoAssetPaths } from './runtime-assets.js';
import { createAssSubtitles, portraitSubtitleLayoutFor } from './subtitles.js';
import {
  PORTRAIT_TEMPLATE_HEIGHT,
  PORTRAIT_TEMPLATE_WIDTH,
} from './templates.js';

type ResolvedImageAsset = Extract<ResolvedSlideAsset, { kind: 'image' }>;

export interface RenderedSlideVideo {
  previewPath: string;
  thumbnailPath: string;
  storyboardPath: string;
  subtitlePath: string;
  sourcesPath: string;
  manifestHash: string;
  slideOutputPaths: string[];
  framePath?: string;
  outroPath?: string;
  mediaMs: number;
  chunkEncodeMs: number;
  finalEncodeMs: number;
  downscaleMs: number;
}

export interface VerticalThumbnailInput {
  mediaPath: string;
  framePath: string;
  window: VerticalVideoManifest['mediaWindow'];
  width: number;
  height: number;
  outputPath: string;
}

export async function composeVerticalThumbnail(
  input: VerticalThumbnailInput,
): Promise<void> {
  sharp.cache(false);
  // Media crops arrive supersampled for zoompan; a raw composite would
  // overflow the output-size canvas, so the media comes back down first.
  const media = await sharp(input.mediaPath)
    .resize(input.window.width, input.window.height, {
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: input.width,
      height: input.height,
      channels: 3,
      background: '#101014',
    },
  })
    .composite([
      { input: media, left: input.window.x, top: input.window.y },
      { input: input.framePath, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(input.outputPath);
}

// Runs after the encode: the supersampled crops exist only for zoompan, while
// the stored slide artifacts keep their window-size contract (and 1/16th of
// the bytes) in R2.
export async function downscaleMediaToWindow(
  mediaPath: string,
  window: VerticalVideoManifest['mediaWindow'],
): Promise<void> {
  sharp.cache(false);
  const media = await sharp(mediaPath)
    .resize(window.width, window.height, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await writeFile(mediaPath, media);
}

interface RenderDependencies {
  resolveAsset: typeof resolveSlideAsset;
  rasterizeFrame: typeof rasterizeBrandFrame;
  rasterizeOutroCard: typeof rasterizeOutro;
  cropMedia: typeof cropMediaImage;
  renderVerticalVideo: typeof renderVerticalSlideVideo;
  composeThumbnail: typeof composeVerticalThumbnail;
  downscaleMedia: typeof downscaleMediaToWindow;
}

const defaultDependencies: RenderDependencies = {
  resolveAsset: resolveSlideAsset,
  rasterizeFrame: rasterizeBrandFrame,
  rasterizeOutroCard: rasterizeOutro,
  cropMedia: cropMediaImage,
  renderVerticalVideo: renderVerticalSlideVideo,
  composeThumbnail: composeVerticalThumbnail,
  downscaleMedia: downscaleMediaToWindow,
};

function sourceListMarkdown(manifest: VerticalVideoManifest): string {
  const uniqueSources = new Map(
    manifest.slides.flatMap((slide) =>
      slide.sources.map((source) => [source.id, source] as const),
    ),
  );
  const sections = Array.from(uniqueSources.values()).map((source) => {
    const link = source.url ? `[${source.label}](${source.url})` : source.label;
    const license = source.licenseUrl
      ? `[${source.license}](${source.licenseUrl})`
      : source.license;
    return `- ${link}\n  - Attribution: ${source.attribution}\n  - License: ${license}`;
  });
  return [
    '# Podcast slide video sources',
    '',
    `Manifest: \`${manifest.schemaVersion}\``,
    '',
    ...sections,
    '',
  ].join('\n');
}

function renderReportMarkdown(
  manifest: VerticalVideoManifest,
  manifestHash: string,
  assets: { slide: Slide; asset: ResolvedImageAsset }[],
): string {
  const masterSize = `${PORTRAIT_TEMPLATE_WIDTH}×${PORTRAIT_TEMPLATE_HEIGHT}`;
  const assetRows = assets.map(({ slide, asset }) => {
    const result = `${asset.width}×${asset.height} ${asset.layout}`;
    return `| ${slide.id} | ${slide.template} | ${result} |`;
  });
  return [
    '# Render report',
    '',
    `- Renderer: \`${manifest.rendererVersion}\``,
    `- Manifest SHA-256: \`${manifestHash}\``,
    `- Canvas: ${manifest.clip.width}×${manifest.clip.height} at ${manifest.clip.fps} fps`,
    `- Master raster: ${masterSize}`,
    `- Duration: ${(manifest.clip.durationMs / 1_000).toFixed(3)} seconds`,
    `- Slides: ${manifest.slides.length}`,
    '- Raster memory isolation: Satori, Resvg, and Sharp execute in separate child processes.',
    '',
    '| Slide | Template | Asset result |',
    '| --- | --- | --- |',
    ...assetRows,
    '',
  ].join('\n');
}

function numberedSlideFilename(index: number): string {
  return `slide-${String(index + 1).padStart(2, '0')}.png`;
}

function encodeProgressReporter(
  onProgress: ((event: RenderProgressEvent) => void) | undefined,
  label: string,
): ((fraction: number) => void) | undefined {
  if (!onProgress) return undefined;
  return (fraction) =>
    onProgress({
      message: `${label} ${Math.round(fraction * 100)}%`,
      phase: 'encode',
      encodeFraction: fraction,
    });
}

/**
 * A render step, carried as structured data so callers can drive a progress bar
 * instead of regex-matching a log line. `message` stays human-readable for the
 * CLI and the service log.
 */
export interface RenderProgressEvent {
  message: string;
  phase: 'media' | 'frame' | 'encode';
  sceneId?: string;
  sceneIndex?: number;
  sceneCount?: number;
  /** Fraction 0..1 of the encode; present only on `phase: 'encode'`. */
  encodeFraction?: number;
}

interface RenderSlideVideoOptions {
  manifestPath: string;
  outputDirectory: string;
  audioSource?: string;
  signal?: AbortSignal;
  onProgress?: (event: RenderProgressEvent) => void;
  dependencies?: Partial<RenderDependencies>;
}

export async function renderSlideVideo(
  options: RenderSlideVideoOptions,
): Promise<RenderedSlideVideo> {
  throwIfAborted(options.signal);
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const rawManifest = JSON.parse(
    await readFile(options.manifestPath, 'utf8'),
  ) as unknown;
  const manifest = parseVerticalVideoManifest(rawManifest);
  const canonicalManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestHash = createHash('sha256')
    .update(canonicalManifest)
    .digest('hex');
  const workDirectory = await mkdtemp(join(tmpdir(), 'podcast-slide-video-'));
  const outputsDirectory = join(
    options.outputDirectory,
    'slides',
    `${manifest.clip.width}x${manifest.clip.height}`,
  );
  const storyboardPath = join(options.outputDirectory, 'storyboard.json');
  const subtitlePath = join(options.outputDirectory, 'captions.ass');
  const sourcesPath = join(options.outputDirectory, 'sources.md');
  const reportPath = join(options.outputDirectory, 'render-report.md');
  const thumbnailPath = join(options.outputDirectory, 'thumbnail.png');
  const previewPath = join(options.outputDirectory, 'preview.mp4');
  const filterScriptPath = join(workDirectory, 'filter-complex.txt');
  const assetDirectory = join(workDirectory, 'assets');

  await mkdir(outputsDirectory, { recursive: true });

  try {
    await Promise.all([
      writeFile(storyboardPath, canonicalManifest, 'utf8'),
      writeFile(
        subtitlePath,
        createAssSubtitles(manifest.captions, portraitSubtitleLayoutFor()),
        'utf8',
      ),
      writeFile(sourcesPath, sourceListMarkdown(manifest), 'utf8'),
    ]);

    return await renderVerticalNewsVideo({
      manifest,
      manifestHash,
      workDirectory,
      outputsDirectory,
      assetDirectory,
      filterScriptPath,
      paths: {
        storyboardPath,
        subtitlePath,
        sourcesPath,
        reportPath,
        thumbnailPath,
        previewPath,
      },
      options,
      dependencies,
    });
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

async function renderVerticalNewsVideo(context: {
  manifest: VerticalVideoManifest;
  manifestHash: string;
  workDirectory: string;
  outputsDirectory: string;
  assetDirectory: string;
  filterScriptPath: string;
  paths: {
    storyboardPath: string;
    subtitlePath: string;
    sourcesPath: string;
    reportPath: string;
    thumbnailPath: string;
    previewPath: string;
  };
  options: RenderSlideVideoOptions;
  dependencies: RenderDependencies;
}): Promise<RenderedSlideVideo> {
  const { manifest, options, dependencies } = context;
  const assetResults: { slide: Slide; asset: ResolvedImageAsset }[] = [];
  const slideOutputPaths: string[] = [];
  const mediaStartedAt = Date.now();

  for (const [index, slide] of manifest.slides.entries()) {
    throwIfAborted(options.signal);
    options.onProgress?.({
      message: `Preparing media ${index + 1}/${manifest.slides.length}: ${slide.id}`,
      phase: 'media',
      sceneId: slide.id,
      sceneIndex: index + 1,
      sceneCount: manifest.slides.length,
    });
    const asset = await dependencies.resolveAsset(slide, {
      workingDirectory: context.assetDirectory,
      signal: options.signal,
    });
    if (asset.kind !== 'image') {
      throw new Error(
        `Scene ${slide.id} requires a remote image: ${asset.reason}`,
      );
    }
    if (!asset.filePath) {
      throw new Error(`Scene ${slide.id} media was not materialized to disk`);
    }
    assetResults.push({ slide, asset });
    const outputPath = join(
      context.outputsDirectory,
      numberedSlideFilename(index),
    );
    slideOutputPaths.push(outputPath);
    await dependencies.cropMedia(
      {
        imagePath: asset.filePath,
        width: manifest.mediaWindow.width * MEDIA_MOTION_SUPERSAMPLE,
        height: manifest.mediaWindow.height * MEDIA_MOTION_SUPERSAMPLE,
        position: asset.position,
      },
      {
        input: join(context.workDirectory, `${slide.id}-crop.json`),
        output: outputPath,
      },
      { signal: options.signal },
    );
  }
  const mediaMs = Date.now() - mediaStartedAt;
  const firstMediaPath = slideOutputPaths[0];
  if (!firstMediaPath) throw new Error('Renderer produced no media images');

  options.onProgress?.({
    message: 'Rendering brand frame and outro card',
    phase: 'frame',
  });
  const framePath = join(options.outputDirectory, 'frame.png');
  const outroPath = join(options.outputDirectory, 'outro.png');
  const portraitOutput = {
    width: manifest.clip.width,
    height: manifest.clip.height,
  };
  await dependencies.rasterizeFrame(
    manifest.headline,
    portraitOutput,
    {
      input: join(context.workDirectory, 'frame.json'),
      svg: join(context.workDirectory, 'frame.svg'),
      master: join(context.workDirectory, 'frame-master.png'),
      output: framePath,
    },
    { signal: options.signal },
  );
  await dependencies.rasterizeOutroCard(
    { title: manifest.outro.title, callToAction: manifest.outro.callToAction },
    portraitOutput,
    {
      input: join(context.workDirectory, 'outro.json'),
      svg: join(context.workDirectory, 'outro.svg'),
      master: join(context.workDirectory, 'outro-master.png'),
      output: outroPath,
    },
    { signal: options.signal },
  );

  await writeFile(
    context.paths.reportPath,
    renderReportMarkdown(manifest, context.manifestHash, assetResults),
    'utf8',
  );
  await dependencies.composeThumbnail({
    mediaPath: firstMediaPath,
    framePath,
    window: manifest.mediaWindow,
    width: manifest.clip.width,
    height: manifest.clip.height,
    outputPath: context.paths.thumbnailPath,
  });
  options.onProgress?.({
    message: 'Encoding vertical news video',
    phase: 'encode',
  });
  throwIfAborted(options.signal);
  const encodeMetrics = await dependencies.renderVerticalVideo({
    manifest,
    mediaPaths: slideOutputPaths,
    framePath,
    outroPath,
    audioSource: options.audioSource ?? manifest.audio.sourceUrl,
    bgmPath: bgmTrackPath(manifest.bgm.trackId),
    subtitlePath: context.paths.subtitlePath,
    fontsDirectory: videoAssetPaths.fontsDirectory,
    outputPath: context.paths.previewPath,
    signal: options.signal,
    // Chunk renders and the final composition report one monotonic aggregate
    // fraction, so the user still sees continuous progress across the bounded-
    // memory multi-pass encode.
    onEncodeProgress: encodeProgressReporter(
      options.onProgress,
      'Encoding vertical news video',
    ),
  });

  const downscaleStartedAt = Date.now();
  for (const path of slideOutputPaths) {
    throwIfAborted(options.signal);
    await dependencies.downscaleMedia(path, manifest.mediaWindow);
  }
  const downscaleMs = Date.now() - downscaleStartedAt;

  return {
    previewPath: context.paths.previewPath,
    thumbnailPath: context.paths.thumbnailPath,
    storyboardPath: context.paths.storyboardPath,
    subtitlePath: context.paths.subtitlePath,
    sourcesPath: context.paths.sourcesPath,
    manifestHash: context.manifestHash,
    slideOutputPaths,
    framePath,
    outroPath,
    mediaMs,
    chunkEncodeMs: encodeMetrics.chunkEncodeMs,
    finalEncodeMs: encodeMetrics.finalEncodeMs,
    downscaleMs,
  };
}

export function describeRenderedVideo(result: RenderedSlideVideo): string {
  return [
    `Video: ${result.previewPath}`,
    `Thumbnail: ${result.thumbnailPath}`,
    `Storyboard: ${result.storyboardPath}`,
    `Subtitles: ${result.subtitlePath}`,
    `Sources: ${result.sourcesPath}`,
    `Slides: ${result.slideOutputPaths.length}`,
    `Manifest hash: ${result.manifestHash}`,
  ].join('\n');
}

export function outputDirectoryLabel(path: string): string {
  return basename(path) || path;
}
