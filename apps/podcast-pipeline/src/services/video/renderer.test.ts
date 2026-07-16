import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { resolveSlideAsset } from './assets.js';
import type { renderStaticSlideVideo } from './ffmpeg-video.js';
import type { Slide, SlideVideoManifest } from './manifest.js';
import type { rasterizeSlide } from './rasterizer.js';
import {
  describeRenderedVideo,
  outputDirectoryLabel,
  renderSlideVideo,
} from './renderer.js';

const temporaryRoots: string[] = [];

function createManifest(): SlideVideoManifest {
  const editorialSource = {
    id: 'editorial',
    label: 'Zap Pilot editorial',
    url: null,
    attribution: 'Zap Pilot',
    license: 'brand-generated' as const,
    licenseUrl: null,
  };
  return {
    schemaVersion: 'podcast-slide-video.v1',
    rendererVersion: 'satori-resvg-v1',
    episode: {
      id: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      languageCode: 'zh-Hant',
      title: '美國高溫下電網拉響紅色警報',
    },
    clip: {
      startMs: 0,
      durationMs: 15_000,
      width: 1920,
      height: 1080,
      fps: 30,
      transitionMs: 200,
    },
    audio: { sourceUrl: 'https://cdn.example.test/narration.m4a' },
    slides: [
      {
        id: 'opening',
        startMs: 0,
        endMs: 4_000,
        template: 'cover',
        kicker: 'ZAP PILOT · GRID WATCH',
        headline: '電網紅色警報',
        subheadline: '前 90 秒靜態投影片試片',
        sources: [editorialSource],
        asset: { kind: 'none' },
      },
      {
        id: 'peak-load',
        startMs: 4_000,
        endMs: 10_000,
        template: 'statistic',
        eyebrow: 'PJM PEAK LOAD',
        value: '161,910',
        unit: 'MW',
        label: '預測尖峰負載',
        context: '備用容量同步下降',
        sources: [editorialSource],
        asset: { kind: 'none' },
      },
      {
        id: 'doe-order',
        startMs: 10_000,
        endMs: 15_000,
        template: 'document',
        issuer: 'U.S. DEPARTMENT OF ENERGY',
        documentNumber: 'ORDER NO. 202-26-3',
        date: 'JUNE 2026',
        headline: '緊急調度命令',
        excerpt: '要求在電網最吃緊時提供額外電力。',
        sources: [
          editorialSource,
          {
            id: 'doe-order',
            label: 'DOE emergency order',
            url: 'https://www.energy.gov/example-order',
            attribution: 'U.S. Department of Energy',
            license: 'official-public-domain',
            licenseUrl: null,
          },
        ],
        asset: { kind: 'none' },
      },
    ],
    captions: [
      { startMs: 0, endMs: 2_000, text: '這是一段靜態投影片試片' },
      { startMs: 2_000, endMs: 5_000, text: '畫面只在換頁時淡入淡出' },
    ],
  };
}

async function makeRenderPaths(): Promise<{
  manifestPath: string;
  outputDirectory: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'renderer-test-'));
  temporaryRoots.push(root);
  const manifestPath = join(root, 'manifest.json');
  const outputDirectory = join(root, 'rendered');
  await writeFile(manifestPath, JSON.stringify(createManifest()), 'utf8');
  return { manifestPath, outputDirectory };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
  vi.restoreAllMocks();
});

describe('renderSlideVideo', () => {
  it('orchestrates every slide and emits a complete reproducible artifact set', async () => {
    const paths = await makeRenderPaths();
    const localAudioSource = join(tmpdir(), 'local-preview-audio.m4a');
    const progress: string[] = [];
    let isolatedWorkDirectory = '';
    let renderedFilter = '';
    const resolveAsset = vi.fn(async (slide: Slide) => ({
      kind: 'fallback' as const,
      reason: `No photo for ${slide.id}`,
      source: slide.sources[0] ?? null,
    }));
    const rasterize = vi.fn(
      async (
        slide: Slide,
        _asset: Awaited<ReturnType<typeof resolveSlideAsset>>,
        slidePaths: Parameters<typeof rasterizeSlide>[2],
      ) => {
        await Promise.all([
          mkdir(dirname(slidePaths.master), { recursive: true }),
          mkdir(dirname(slidePaths.output), { recursive: true }),
        ]);
        await Promise.all([
          writeFile(slidePaths.master, `4k:${slide.id}`, 'utf8'),
          writeFile(slidePaths.output, `1080p:${slide.id}`, 'utf8'),
        ]);
      },
    );
    const renderVideo = vi.fn(
      async (videoOptions: Parameters<typeof renderStaticSlideVideo>[0]) => {
        isolatedWorkDirectory = dirname(videoOptions.filterScriptPath);
        renderedFilter = await readFile(videoOptions.filterScriptPath, 'utf8');
        await writeFile(videoOptions.outputPath, 'mock-mp4', 'utf8');
      },
    );

    const result = await renderSlideVideo({
      ...paths,
      audioSource: localAudioSource,
      onProgress: (message) => progress.push(message),
      dependencies: {
        resolveAsset,
        rasterize,
        renderVideo,
      },
    });

    expect(resolveAsset.mock.calls.map(([slide]) => slide.id)).toEqual([
      'opening',
      'peak-load',
      'doe-order',
    ]);
    expect(rasterize).toHaveBeenCalledTimes(3);
    expect(renderVideo).toHaveBeenCalledOnce();
    expect(renderVideo.mock.calls[0]?.[0]).toMatchObject({
      slidePaths: result.slideOutputPaths,
      audioSource: localAudioSource,
      outputPath: result.previewPath,
    });
    expect(progress).toEqual([
      'Rendering slide 1/3: opening',
      'Rendering slide 2/3: peak-load',
      'Rendering slide 3/3: doe-order',
      'Encoding static slide video',
    ]);
    expect(
      result.slideMasterPaths.map((path) => path.split('/').at(-1)),
    ).toEqual(['slide-01.png', 'slide-02.png', 'slide-03.png']);
    expect(await readFile(result.thumbnailPath, 'utf8')).toBe('1080p:opening');
    expect(await readFile(result.previewPath, 'utf8')).toBe('mock-mp4');
    expect(renderedFilter).toContain('xfade=transition=fade');
    expect(renderedFilter).not.toMatch(/zoompan|gblur|boxblur/i);

    const storyboard = await readFile(result.storyboardPath, 'utf8');
    const expectedHash = createHash('sha256').update(storyboard).digest('hex');
    expect(result.manifestHash).toBe(expectedHash);
    expect(storyboard.endsWith('\n')).toBe(true);
    expect(await readFile(result.subtitlePath, 'utf8')).toContain(
      'Dialogue: 0,0:00:00.00,0:00:02.00',
    );

    const sources = await readFile(result.sourcesPath, 'utf8');
    expect(sources.match(/Zap Pilot editorial/g)).toHaveLength(1);
    expect(sources).toContain(
      '[DOE emergency order](https://www.energy.gov/example-order)',
    );
    expect(sources).toContain('License: official-public-domain');

    const report = await readFile(
      join(paths.outputDirectory, 'render-report.md'),
      'utf8',
    );
    expect(report).toContain('Master raster: 3840×2160');
    expect(report).toContain('| peak-load | statistic | fallback');
    expect(report).toContain('separate child processes');
    await expect(access(isolatedWorkDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('uses manifest audio by default and removes its work directory on failure', async () => {
    const paths = await makeRenderPaths();
    let isolatedWorkDirectory = '';
    const resolveAsset = vi.fn(async (slide: Slide) => ({
      kind: 'fallback' as const,
      reason: 'No image',
      source: slide.sources[0] ?? null,
    }));
    const rasterize = vi.fn(
      async (
        slide: Slide,
        _asset: Awaited<ReturnType<typeof resolveSlideAsset>>,
        slidePaths: Parameters<typeof rasterizeSlide>[2],
      ) => {
        await Promise.all([
          writeFile(slidePaths.master, `master:${slide.id}`, 'utf8'),
          writeFile(slidePaths.output, `output:${slide.id}`, 'utf8'),
        ]);
      },
    );
    const renderVideo = vi.fn(
      async (videoOptions: Parameters<typeof renderStaticSlideVideo>[0]) => {
        isolatedWorkDirectory = dirname(videoOptions.filterScriptPath);
        expect(videoOptions.audioSource).toBe(
          'https://cdn.example.test/narration.m4a',
        );
        throw new Error('FFmpeg exited with status 137');
      },
    );

    await expect(
      renderSlideVideo({
        ...paths,
        dependencies: {
          resolveAsset,
          rasterize,
          renderVideo,
        },
      }),
    ).rejects.toThrow('FFmpeg exited with status 137');
    expect(renderVideo).toHaveBeenCalledOnce();
    await expect(access(isolatedWorkDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('removes its work directory when rasterization fails before encoding', async () => {
    const paths = await makeRenderPaths();
    let isolatedWorkDirectory = '';
    const rasterize = vi.fn(
      async (
        _slide: Slide,
        _asset: Awaited<ReturnType<typeof resolveSlideAsset>>,
        slidePaths: Parameters<typeof rasterizeSlide>[2],
      ) => {
        isolatedWorkDirectory = dirname(slidePaths.input);
        throw new Error('Satori rejected overflowing text');
      },
    );

    await expect(
      renderSlideVideo({
        ...paths,
        dependencies: {
          resolveAsset: async (slide: Slide) => ({
            kind: 'fallback',
            reason: 'No image',
            source: slide.sources[0] ?? null,
          }),
          rasterize,
          renderVideo: vi.fn(),
        },
      }),
    ).rejects.toThrow('Satori rejected overflowing text');
    await expect(access(isolatedWorkDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('render result descriptions', () => {
  it('summarizes artifact paths and handles root directory labels', () => {
    expect(outputDirectoryLabel(join(tmpdir(), 'podcast-slides'))).toBe(
      'podcast-slides',
    );
    expect(outputDirectoryLabel('/')).toBe('/');
    expect(
      describeRenderedVideo({
        previewPath: '/out/preview.mp4',
        thumbnailPath: '/out/thumbnail.png',
        storyboardPath: '/out/storyboard.json',
        subtitlePath: '/out/captions.ass',
        sourcesPath: '/out/sources.md',
        manifestHash: 'abc123',
        slideMasterPaths: ['/out/slides/master/slide-01.png'],
        slideOutputPaths: ['/out/slides/1080p/slide-01.png'],
      }),
    ).toBe(
      [
        'Video: /out/preview.mp4',
        'Thumbnail: /out/thumbnail.png',
        'Storyboard: /out/storyboard.json',
        'Subtitles: /out/captions.ass',
        'Sources: /out/sources.md',
        'Slides: 1',
        'Manifest hash: abc123',
      ].join('\n'),
    );
  });
});
