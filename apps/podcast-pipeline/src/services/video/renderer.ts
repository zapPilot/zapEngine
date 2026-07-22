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

import { throwIfAborted } from './abort.js';
import { type ResolvedSlideAsset, resolveSlideAsset } from './assets.js';
import {
  buildStaticSlideFilter,
  renderStaticSlideVideo,
} from './ffmpeg-video.js';
import {
  parseSlideVideoManifest,
  type Slide,
  type SlideVideoManifest,
} from './manifest.js';
import { rasterizeSlide } from './rasterizer.js';
import { videoAssetPaths } from './runtime-assets.js';
import { createAssSubtitles } from './subtitles.js';

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
}

interface RenderDependencies {
  resolveAsset: typeof resolveSlideAsset;
  rasterize: typeof rasterizeSlide;
  renderVideo: typeof renderStaticSlideVideo;
}

const defaultDependencies: RenderDependencies = {
  resolveAsset: resolveSlideAsset,
  rasterize: rasterizeSlide,
  renderVideo: renderStaticSlideVideo,
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

export async function renderSlideVideo(options: {
  manifestPath: string;
  outputDirectory: string;
  audioSource?: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  dependencies?: Partial<RenderDependencies>;
}): Promise<RenderedSlideVideo> {
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
    await Promise.all([
      writeFile(storyboardPath, canonicalManifest, 'utf8'),
      writeFile(subtitlePath, createAssSubtitles(manifest.captions), 'utf8'),
      writeFile(sourcesPath, sourceListMarkdown(manifest), 'utf8'),
    ]);

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
