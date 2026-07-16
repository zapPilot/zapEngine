import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { renderSlideVideo as renderSlideVideoType } from './renderer.js';

const renderSlideVideoMock = vi.hoisted(() => vi.fn());

vi.mock('./renderer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./renderer.js')>();
  return { ...actual, renderSlideVideo: renderSlideVideoMock };
});

import { parseVideoCliArgs, runVideoCli } from './cli.js';

afterEach(() => {
  renderSlideVideoMock.mockReset();
  vi.restoreAllMocks();
});

describe('parseVideoCliArgs', () => {
  it('resolves manifest, output, and local audio paths', () => {
    expect(
      parseVideoCliArgs([
        '--audio',
        'audio/preview.m4a',
        '--manifest',
        'examples/video/manifest.json',
        '--output',
        'rendered/preview',
      ]),
    ).toEqual({
      manifestPath: resolve('examples/video/manifest.json'),
      outputDirectory: resolve('rendered/preview'),
      audioSource: resolve('audio/preview.m4a'),
    });
  });

  it('preserves remote audio URLs and allows audio to be omitted', () => {
    const baseArguments = ['--manifest', 'manifest.json', '--output', 'output'];
    expect(parseVideoCliArgs(baseArguments)).toEqual({
      manifestPath: resolve('manifest.json'),
      outputDirectory: resolve('output'),
    });
    expect(
      parseVideoCliArgs([
        ...baseArguments,
        '--audio',
        'https://cdn.example.test/narration.m4a',
      ]).audioSource,
    ).toBe('https://cdn.example.test/narration.m4a');
  });

  it('rejects missing, malformed, and unknown options', () => {
    expect(() => parseVideoCliArgs([])).toThrow(
      'Both --manifest and --output are required',
    );
    expect(() =>
      parseVideoCliArgs(['--manifest', 'manifest.json', '--output']),
    ).toThrow('Usage: video:render');
    expect(() =>
      parseVideoCliArgs(['manifest', 'manifest.json', '--output', 'out']),
    ).toThrow('Usage: video:render');
    expect(() =>
      parseVideoCliArgs(['--manifest', '--output', 'out', 'ignored']),
    ).toThrow('Usage: video:render');
    expect(() =>
      parseVideoCliArgs([
        '--manifest',
        'manifest.json',
        '--output',
        'out',
        '--quality',
        '4k',
      ]),
    ).toThrow('Unknown option: --quality');
  });
});

describe('runVideoCli', () => {
  it('forwards parsed options and reports progress plus final artifacts', async () => {
    const root = join(tmpdir(), 'podcast-cli-test');
    const manifestPath = join(root, 'manifest.json');
    const outputDirectory = join(root, 'static-preview');
    const audioSource = join(root, 'preview.m4a');
    const result = {
      previewPath: join(outputDirectory, 'preview.mp4'),
      thumbnailPath: join(outputDirectory, 'thumbnail.png'),
      storyboardPath: join(outputDirectory, 'storyboard.json'),
      subtitlePath: join(outputDirectory, 'captions.ass'),
      sourcesPath: join(outputDirectory, 'sources.md'),
      manifestHash: 'feedface',
      slideMasterPaths: [join(outputDirectory, 'slides/master/slide-01.png')],
      slideOutputPaths: [join(outputDirectory, 'slides/1080p/slide-01.png')],
    };
    renderSlideVideoMock.mockImplementation(
      async (options: Parameters<typeof renderSlideVideoType>[0]) => {
        options.onProgress?.('Rendering slide 1/1: opening');
        return result;
      },
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runVideoCli([
      '--manifest',
      manifestPath,
      '--output',
      outputDirectory,
      '--audio',
      audioSource,
    ]);

    expect(renderSlideVideoMock).toHaveBeenCalledOnce();
    expect(renderSlideVideoMock.mock.calls[0]?.[0]).toMatchObject({
      manifestPath,
      outputDirectory,
      audioSource,
      onProgress: expect.any(Function),
    });
    expect(log.mock.calls.map(([message]) => message)).toEqual([
      'Rendering static-preview',
      'Rendering slide 1/1: opening',
      [
        `Video: ${result.previewPath}`,
        `Thumbnail: ${result.thumbnailPath}`,
        `Storyboard: ${result.storyboardPath}`,
        `Subtitles: ${result.subtitlePath}`,
        `Sources: ${result.sourcesPath}`,
        'Slides: 1',
        'Manifest hash: feedface',
      ].join('\n'),
    ]);
  });
});
