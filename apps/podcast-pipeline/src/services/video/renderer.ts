import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import sharp from 'sharp';

import { throwIfAborted } from './abort.js';
import { type ResolvedSlideAsset, resolveSlideAsset } from './assets.js';
import {
  buildStaticSlideFilter,
  buildVerticalSlideFilter,
  renderStaticSlideVideo,
  renderVerticalSlideVideo,
} from './ffmpeg-video.js';
import {
  parseSlideVideoManifest,
  type Slide,
  type SlideVideoManifest,
  VERTICAL_VIDEO_SCHEMA_VERSION,
  type VerticalVideoManifest,
} from './manifest.js';
import {
  cropMediaImage,
  rasterizeBrandFrame,
  rasterizeOutro,
  rasterizeSlide,
} from './rasterizer.js';
import { bgmTrackPath, videoAssetPaths } from './runtime-assets.js';
import { createAssSubtitles, PORTRAIT_SUBTITLE_LAYOUT } from './subtitles.js';

type ResolvedImageAsset = Extract<ResolvedSlideAsset, { kind: 'image' }>;

export interface RenderedSlideVideo {
  previewPath: string;
  thumbnailPath: string;
  storyboardPath: string;
  subtitlePath: string;
  sourcesPath: string;
  manifestHash: string;
  slideMasterPaths: string[];
  slideOutputPaths: string[];
  framePath?: string;
  outroPath?: string;
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
  await sharp({
    create: {
      width: input.width,
      height: input.height,
      channels: 3,
      background: '#101014',
    },
  })
    .composite([
      { input: input.mediaPath, left: input.window.x, top: input.window.y },
      { input: input.framePath, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(input.outputPath);
}

interface RenderDependencies {
  resolveAsset: typeof resolveSlideAsset;
  rasterize: typeof rasterizeSlide;
  renderVideo: typeof renderStaticSlideVideo;
  rasterizeFrame: typeof rasterizeBrandFrame;
  rasterizeOutroCard: typeof rasterizeOutro;
  cropMedia: typeof cropMediaImage;
  renderVerticalVideo: typeof renderVerticalSlideVideo;
  composeThumbnail: typeof composeVerticalThumbnail;
}

const defaultDependencies: RenderDependencies = {
  resolveAsset: resolveSlideAsset,
  rasterize: rasterizeSlide,
  renderVideo: renderStaticSlideVideo,
  rasterizeFrame: rasterizeBrandFrame,
  rasterizeOutroCard: rasterizeOutro,
  cropMedia: cropMediaImage,
  renderVerticalVideo: renderVerticalSlideVideo,
  composeThumbnail: composeVerticalThumbnail,
};

function sourceListMarkdown(manifest: SlideVideoManifest): string {
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
  manifest: SlideVideoManifest,
  manifestHash: string,
  assets: { slide: Slide; asset: ResolvedImageAsset }[],
): string {
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
    `- Master raster: ${manifest.clip.width * 2}×${manifest.clip.height * 2}`,
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

interface RenderSlideVideoOptions {
  manifestPath: string;
  outputDirectory: string;
  audioSource?: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
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
  const manifest = parseSlideVideoManifest(rawManifest);
  const canonicalManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestHash = createHash('sha256')
    .update(canonicalManifest)
    .digest('hex');
  const workDirectory = await mkdtemp(join(tmpdir(), 'podcast-slide-video-'));
  const mastersDirectory = join(options.outputDirectory, 'slides', 'master');
  const outputsDirectory = join(options.outputDirectory, 'slides', '1080p');
  const storyboardPath = join(options.outputDirectory, 'storyboard.json');
  const subtitlePath = join(options.outputDirectory, 'captions.ass');
  const sourcesPath = join(options.outputDirectory, 'sources.md');
  const reportPath = join(options.outputDirectory, 'render-report.md');
  const thumbnailPath = join(options.outputDirectory, 'thumbnail.png');
  const previewPath = join(options.outputDirectory, 'preview.mp4');
  const filterScriptPath = join(workDirectory, 'filter-complex.txt');
  const assetDirectory = join(workDirectory, 'assets');

  await Promise.all([
    mkdir(mastersDirectory, { recursive: true }),
    mkdir(outputsDirectory, { recursive: true }),
  ]);

  try {
    const isVertical = manifest.schemaVersion === VERTICAL_VIDEO_SCHEMA_VERSION;
    await Promise.all([
      writeFile(storyboardPath, canonicalManifest, 'utf8'),
      writeFile(
        subtitlePath,
        createAssSubtitles(
          manifest.captions,
          isVertical ? PORTRAIT_SUBTITLE_LAYOUT : undefined,
        ),
        'utf8',
      ),
      writeFile(sourcesPath, sourceListMarkdown(manifest), 'utf8'),
    ]);

    if (manifest.schemaVersion === VERTICAL_VIDEO_SCHEMA_VERSION) {
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
    }

    const assetResults: {
      slide: Slide;
      asset: ResolvedImageAsset;
    }[] = [];
    const slideMasterPaths: string[] = [];
    const slideOutputPaths: string[] = [];

    for (const [index, slide] of manifest.slides.entries()) {
      throwIfAborted(options.signal);
      options.onProgress?.(
        `Rendering slide ${index + 1}/${manifest.slides.length}: ${slide.id}`,
      );
      const asset = await dependencies.resolveAsset(slide, {
        workingDirectory: assetDirectory,
        signal: options.signal,
      });
      if (asset.kind !== 'image') {
        throw new Error(
          `Scene ${slide.id} requires a remote image: ${asset.reason}`,
        );
      }
      assetResults.push({ slide, asset });
      const filename = numberedSlideFilename(index);
      const masterPath = join(mastersDirectory, filename);
      const outputPath = join(outputsDirectory, filename);
      slideMasterPaths.push(masterPath);
      slideOutputPaths.push(outputPath);
      await dependencies.rasterize(
        slide,
        asset,
        {
          input: join(workDirectory, `${slide.id}.json`),
          svg: join(workDirectory, `${slide.id}.svg`),
          master: masterPath,
          output: outputPath,
        },
        { signal: options.signal },
      );
    }

    await writeFile(
      reportPath,
      renderReportMarkdown(manifest, manifestHash, assetResults),
      'utf8',
    );
    const firstSlidePath = slideOutputPaths[0];
    if (!firstSlidePath) throw new Error('Renderer produced no slide images');
    await copyFile(firstSlidePath, thumbnailPath);
    await writeFile(
      filterScriptPath,
      buildStaticSlideFilter(
        manifest,
        subtitlePath,
        videoAssetPaths.fontsDirectory,
      ),
      'utf8',
    );

    options.onProgress?.('Encoding image scene video');
    throwIfAborted(options.signal);
    await dependencies.renderVideo({
      manifest,
      slidePaths: slideOutputPaths,
      audioSource: options.audioSource ?? manifest.audio.sourceUrl,
      filterScriptPath,
      outputPath: previewPath,
      signal: options.signal,
    });

    return {
      previewPath,
      thumbnailPath,
      storyboardPath,
      subtitlePath,
      sourcesPath,
      manifestHash,
      slideMasterPaths,
      slideOutputPaths,
    };
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

  for (const [index, slide] of manifest.slides.entries()) {
    throwIfAborted(options.signal);
    options.onProgress?.(
      `Preparing media ${index + 1}/${manifest.slides.length}: ${slide.id}`,
    );
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
        width: manifest.mediaWindow.width,
        height: manifest.mediaWindow.height,
        position: asset.position,
      },
      {
        input: join(context.workDirectory, `${slide.id}-crop.json`),
        output: outputPath,
      },
      { signal: options.signal },
    );
  }
  const firstMediaPath = slideOutputPaths[0];
  if (!firstMediaPath) throw new Error('Renderer produced no media images');

  options.onProgress?.('Rendering brand frame and outro card');
  const framePath = join(options.outputDirectory, 'frame.png');
  const outroPath = join(options.outputDirectory, 'outro.png');
  await dependencies.rasterizeFrame(
    manifest.headline,
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
  await writeFile(
    context.filterScriptPath,
    buildVerticalSlideFilter(
      manifest,
      context.paths.subtitlePath,
      videoAssetPaths.fontsDirectory,
    ),
    'utf8',
  );

  options.onProgress?.('Encoding vertical news video');
  throwIfAborted(options.signal);
  await dependencies.renderVerticalVideo({
    manifest,
    mediaPaths: slideOutputPaths,
    framePath,
    outroPath,
    audioSource: options.audioSource ?? manifest.audio.sourceUrl,
    bgmPath: bgmTrackPath(manifest.bgm.trackId),
    filterScriptPath: context.filterScriptPath,
    outputPath: context.paths.previewPath,
    signal: options.signal,
  });

  return {
    previewPath: context.paths.previewPath,
    thumbnailPath: context.paths.thumbnailPath,
    storyboardPath: context.paths.storyboardPath,
    subtitlePath: context.paths.subtitlePath,
    sourcesPath: context.paths.sourcesPath,
    manifestHash: context.manifestHash,
    slideMasterPaths: [],
    slideOutputPaths,
    framePath,
    outroPath,
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
