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
import type {
  renderStaticSlideVideo,
  renderVerticalSlideVideo,
} from './ffmpeg-video.js';
import type {
  Slide,
  SlideVideoManifest,
  VerticalVideoManifest,
} from './manifest.js';
import type { cropMediaImage, rasterizeSlide } from './rasterizer.js';
import {
  type composeVerticalThumbnail,
  describeRenderedVideo,
  outputDirectoryLabel,
  renderSlideVideo,
} from './renderer.js';

const temporaryRoots: string[] = [];

function createManifest(): SlideVideoManifest {
  const sourceFor = (sceneId: string) => ({
    id: `${sceneId}-source`,
    label: `${sceneId} source`,
    url: `https://news.example.test/${sceneId}`,
    attribution: 'Example News',
    license: 'unknown' as const,
    licenseUrl: null,
  });
  const slideFor = (index: number) => {
    const sceneId = `scene-${String(index + 1).padStart(2, '0')}`;
    const source = sourceFor(sceneId);
    return {
      id: sceneId,
      startMs: index * 5_000,
      endMs: (index + 1) * 5_000,
      template: 'image' as const,
      sources: [source],
      asset: {
        kind: 'remoteImage' as const,
        sourceId: source.id,
        url: `https://images.example.test/${sceneId}.jpg`,
        sha256: 'a'.repeat(64),
        layout: 'fullBleed' as const,
        position: 'center' as const,
      },
    };
  };
  return {
    schemaVersion: 'podcast-slide-video.v2',
    rendererVersion: 'satori-resvg-v3',
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
    slides: [slideFor(0), slideFor(1), slideFor(2)],
    captions: [
      { startMs: 0, endMs: 5_000, text: '第一段字幕' },
      { startMs: 5_000, endMs: 10_000, text: '第二段字幕' },
      { startMs: 10_000, endMs: 15_000, text: '第三段字幕' },
    ],
  };
}

function resolvedImage(slide: Slide) {
  const source = slide.sources[0];
  if (!source) throw new Error('Test slide is missing its source');
  return {
    kind: 'image' as const,
    filePath: `/tmp/${slide.id}.jpg`,
    contentType: 'image/jpeg',
    layout: 'fullBleed' as const,
    position: 'center' as const,
    width: 3_000,
    height: 2_000,
    source,
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
    const resolveAsset = vi.fn(async (slide: Slide) => resolvedImage(slide));
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
      'scene-01',
      'scene-02',
      'scene-03',
    ]);
    expect(rasterize).toHaveBeenCalledTimes(3);
    expect(renderVideo).toHaveBeenCalledOnce();
    expect(renderVideo.mock.calls[0]?.[0]).toMatchObject({
      slidePaths: result.slideOutputPaths,
      audioSource: localAudioSource,
      outputPath: result.previewPath,
    });
    expect(progress).toEqual([
      'Rendering slide 1/3: scene-01',
      'Rendering slide 2/3: scene-02',
      'Rendering slide 3/3: scene-03',
      'Encoding image scene video',
    ]);
    expect(
      result.slideMasterPaths.map((path) => path.split('/').at(-1)),
    ).toEqual(['slide-01.png', 'slide-02.png', 'slide-03.png']);
    expect(await readFile(result.thumbnailPath, 'utf8')).toBe('1080p:scene-01');
    expect(await readFile(result.previewPath, 'utf8')).toBe('mock-mp4');
    expect(renderedFilter).toContain('xfade=transition=fade');
    expect(renderedFilter).toContain('zoompan=');
    expect(renderedFilter).not.toMatch(/gblur|boxblur/i);

    const storyboard = await readFile(result.storyboardPath, 'utf8');
    const expectedHash = createHash('sha256').update(storyboard).digest('hex');
    expect(result.manifestHash).toBe(expectedHash);
    expect(storyboard.endsWith('\n')).toBe(true);
    expect(await readFile(result.subtitlePath, 'utf8')).toContain(
      'Dialogue: 0,0:00:00.00,0:00:05.00',
    );

    const sources = await readFile(result.sourcesPath, 'utf8');
    expect(sources).toContain(
      '[scene-01 source](https://news.example.test/scene-01)',
    );
    expect(sources).toContain('License: unknown');

    const report = await readFile(
      join(paths.outputDirectory, 'render-report.md'),
      'utf8',
    );
    expect(report).toContain('Master raster: 3840×2160');
    expect(report).toContain('| scene-02 | image | 3000×2000 fullBleed |');
    expect(report).toContain('separate child processes');
    await expect(access(isolatedWorkDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('uses manifest audio by default and removes its work directory on failure', async () => {
    const paths = await makeRenderPaths();
    let isolatedWorkDirectory = '';
    const resolveAsset = vi.fn(async (slide: Slide) => resolvedImage(slide));
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

  it('fails closed when a remote image cannot be resolved', async () => {
    const paths = await makeRenderPaths();
    const rasterize = vi.fn();
    const renderVideo = vi.fn();

    await expect(
      renderSlideVideo({
        ...paths,
        dependencies: {
          resolveAsset: async (slide: Slide) => ({
            kind: 'fallback',
            reason: 'download failed',
            source: slide.sources[0] ?? null,
          }),
          rasterize,
          renderVideo,
        },
      }),
    ).rejects.toThrow(
      'Scene scene-01 requires a remote image: download failed',
    );
    expect(rasterize).not.toHaveBeenCalled();
    expect(renderVideo).not.toHaveBeenCalled();
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
            ...resolvedImage(slide),
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

function createVerticalManifest(): VerticalVideoManifest {
  const base = createManifest() as Extract<
    SlideVideoManifest,
    { schemaVersion: 'podcast-slide-video.v2' }
  >;
  return {
    schemaVersion: 'podcast-slide-video.v3',
    rendererVersion: 'satori-resvg-v4',
    episode: base.episode,
    clip: {
      startMs: 0,
      durationMs: 17_800,
      width: 1080,
      height: 1920,
      fps: 30,
      transitionMs: 200,
    },
    mediaWindow: { x: 0, y: 620, width: 1080, height: 960 },
    headline: {
      kicker: '鏈上快訊',
      titleLines: ['美國高溫下電網拉響紅色警報'],
    },
    audio: {
      sourceUrl: 'https://cdn.example.test/narration.m4a',
      narrationDurationMs: 15_000,
    },
    bgm: { trackId: 'bgm-02', gainDb: -21 },
    outro: {
      startMs: 15_000,
      title: 'From Fed to Chain',
      callToAction: '訂閱・分享・留言',
    },
    slides: base.slides,
    captions: base.captions,
  };
}

describe('renderSlideVideo (vertical news manifests)', () => {
  it('runs the two-layer pipeline: crops, brand cards, thumbnail, and BGM mix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'renderer-vertical-test-'));
    temporaryRoots.push(root);
    const manifestPath = join(root, 'manifest.json');
    const outputDirectory = join(root, 'rendered');
    await writeFile(manifestPath, JSON.stringify(createVerticalManifest()));

    const progress: string[] = [];
    let renderedFilter = '';
    const resolveAsset = vi.fn(async (slide: Slide) => resolvedImage(slide));
    const rasterize = vi.fn();
    const renderVideo = vi.fn();
    const cropMedia = vi.fn(
      async (
        crop: Parameters<typeof cropMediaImage>[0],
        cropPaths: Parameters<typeof cropMediaImage>[1],
      ) => {
        await mkdir(dirname(cropPaths.output), { recursive: true });
        await writeFile(cropPaths.output, `crop:${crop.imagePath}`, 'utf8');
      },
    );
    const writeCard = async (cardPaths: { output: string }, body: string) => {
      await mkdir(dirname(cardPaths.output), { recursive: true });
      await writeFile(cardPaths.output, body, 'utf8');
    };
    const rasterizeFrame = vi.fn(
      async (_frame: unknown, cardPaths: { output: string }) =>
        writeCard(cardPaths, 'brand-frame'),
    );
    const rasterizeOutroCard = vi.fn(
      async (_outro: unknown, cardPaths: { output: string }) =>
        writeCard(cardPaths, 'outro-card'),
    );
    const composeThumbnail = vi.fn(
      async (input: Parameters<typeof composeVerticalThumbnail>[0]) => {
        await writeFile(input.outputPath, 'thumbnail', 'utf8');
      },
    );
    const renderVerticalVideo = vi.fn(
      async (videoOptions: Parameters<typeof renderVerticalSlideVideo>[0]) => {
        renderedFilter = await readFile(videoOptions.filterScriptPath, 'utf8');
        await writeFile(videoOptions.outputPath, 'mock-vertical-mp4', 'utf8');
      },
    );

    const result = await renderSlideVideo({
      manifestPath,
      outputDirectory,
      onProgress: (message) => progress.push(message),
      dependencies: {
        resolveAsset,
        rasterize,
        renderVideo,
        cropMedia,
        rasterizeFrame,
        rasterizeOutroCard,
        composeThumbnail,
        renderVerticalVideo,
      },
    });

    expect(rasterize).not.toHaveBeenCalled();
    expect(renderVideo).not.toHaveBeenCalled();
    expect(cropMedia).toHaveBeenCalledTimes(3);
    const firstCrop = cropMedia.mock.calls[0]?.[0];
    expect(firstCrop).toMatchObject({
      width: 1080,
      height: 960,
      position: 'center',
    });
    expect(firstCrop?.imagePath.endsWith('scene-01.jpg')).toBe(true);
    expect(rasterizeFrame.mock.calls[0]?.[0]).toEqual({
      kicker: '鏈上快訊',
      titleLines: ['美國高溫下電網拉響紅色警報'],
    });
    expect(rasterizeOutroCard.mock.calls[0]?.[0]).toEqual({
      title: 'From Fed to Chain',
      callToAction: '訂閱・分享・留言',
    });
    expect(composeThumbnail.mock.calls[0]?.[0]).toMatchObject({
      mediaPath: result.slideOutputPaths[0],
      framePath: result.framePath,
      window: { x: 0, y: 620, width: 1080, height: 960 },
      width: 1080,
      height: 1920,
    });
    expect(renderVerticalVideo).toHaveBeenCalledOnce();
    expect(renderVerticalVideo.mock.calls[0]?.[0]).toMatchObject({
      mediaPaths: result.slideOutputPaths,
      framePath: result.framePath,
      outroPath: result.outroPath,
      audioSource: 'https://cdn.example.test/narration.m4a',
      outputPath: result.previewPath,
    });
    expect(
      renderVerticalVideo.mock.calls[0]?.[0]?.bgmPath.endsWith(
        'music/bgm-02.mp3',
      ),
    ).toBe(true);
    expect(renderedFilter).toContain('pad=1080:1920:0:620');
    expect(renderedFilter).toContain('sidechaincompress=');
    expect(await readFile(result.subtitlePath, 'utf8')).toContain(
      'PlayResX: 1080',
    );
    expect(result.slideMasterPaths).toEqual([]);
    expect(progress).toEqual([
      'Preparing media 1/3: scene-01',
      'Preparing media 2/3: scene-02',
      'Preparing media 3/3: scene-03',
      'Rendering brand frame and outro card',
      'Encoding vertical news video',
    ]);
  });

  it('fails closed when the resolved media has no file on disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'renderer-vertical-nofile-'));
    temporaryRoots.push(root);
    const manifestPath = join(root, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(createVerticalManifest()));

    await expect(
      renderSlideVideo({
        manifestPath,
        outputDirectory: join(root, 'rendered'),
        dependencies: {
          resolveAsset: async (slide: Slide) => ({
            ...resolvedImage(slide),
            filePath: undefined,
          }),
          cropMedia: vi.fn(),
          renderVerticalVideo: vi.fn(),
        },
      }),
    ).rejects.toThrow('Scene scene-01 media was not materialized to disk');
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
