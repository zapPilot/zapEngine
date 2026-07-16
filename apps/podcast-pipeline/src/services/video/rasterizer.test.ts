import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedSlideAsset } from './assets.js';
import type { Slide } from './manifest.js';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { rasterizeSlide, runRasterStage } from './rasterizer.js';

function createSlide(): Slide {
  return {
    id: 'static-cover',
    startMs: 0,
    endMs: 4_000,
    template: 'cover',
    kicker: 'ZAP PILOT',
    headline: '美國電網高溫警報',
    subheadline: '高畫質靜態投影片',
    sources: [
      {
        id: 'editorial',
        label: 'Zap Pilot editorial',
        url: null,
        attribution: 'Zap Pilot',
        license: 'brand-generated',
        licenseUrl: null,
      },
    ],
    asset: { kind: 'none' },
  };
}

function createAsset(slide: Slide): ResolvedSlideAsset {
  return {
    kind: 'fallback',
    reason: 'Editorial card',
    source: slide.sources[0] ?? null,
  };
}

afterEach(() => {
  spawnMock.mockReset();
});

describe('rasterizeSlide', () => {
  it('writes the stage input and invokes isolated stages in strict order', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rasterizer-test-'));
    const slide = createSlide();
    const asset = createAsset(slide);
    const paths = {
      input: join(directory, 'work', 'slide.json'),
      svg: join(directory, 'work', 'slide.svg'),
      master: join(directory, 'slides', 'master', 'slide.png'),
      output: join(directory, 'slides', '1080p', 'slide.png'),
    };
    const calls: string[] = [];
    const runStage = vi.fn(
      async (
        stage: 'satori' | 'resvg' | 'sharp',
        input: string,
        output: string,
      ) => {
        calls.push(`${stage}:${input}->${output}`);
        await writeFile(output, stage, 'utf8');
      },
    );

    await rasterizeSlide(slide, asset, paths, runStage);

    expect(JSON.parse(await readFile(paths.input, 'utf8'))).toEqual({
      slide,
      asset,
    });
    expect(calls).toEqual([
      `satori:${paths.input}->${paths.svg}`,
      `resvg:${paths.svg}->${paths.master}`,
      `sharp:${paths.master}->${paths.output}`,
    ]);
    expect(await readFile(paths.output, 'utf8')).toBe('sharp');
  });

  it('stops the pipeline immediately when a stage fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rasterizer-error-test-'));
    const slide = createSlide();
    const paths = {
      input: join(directory, 'slide.json'),
      svg: join(directory, 'slide.svg'),
      master: join(directory, 'master', 'slide.png'),
      output: join(directory, 'output', 'slide.png'),
    };
    const runStage = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('resvg exhausted memory'));

    await expect(
      rasterizeSlide(slide, createAsset(slide), paths, runStage),
    ).rejects.toThrow('resvg exhausted memory');
    expect(runStage).toHaveBeenCalledTimes(2);
    expect(runStage.mock.calls[1]?.[0]).toBe('resvg');
  });
});

describe('runRasterStage', () => {
  it('spawns the requested stage through the current Node runtime', async () => {
    const child = new EventEmitter();
    const inputPath = join(tmpdir(), 'slide.json');
    const outputPath = join(tmpdir(), 'slide.svg');
    spawnMock.mockReturnValue(child);

    const stagePromise = runRasterStage('satori', inputPath, outputPath);
    child.emit('exit', 0, null);
    await stagePromise;

    expect(spawnMock).toHaveBeenCalledOnce();
    const [executable, args, options] = spawnMock.mock.calls[0] ?? [];
    expect(executable).toBe(process.execPath);
    expect(args).toEqual([
      ...process.execArgv,
      expect.stringMatching(/raster-stage-entry\.(?:ts|js)$/),
      'satori',
      inputPath,
      outputPath,
    ]);
    expect(options).toEqual({ stdio: 'inherit' });
  });

  it('surfaces child startup, exit, and signal failures', async () => {
    const pngInput = join(tmpdir(), 'in.png');
    const pngOutput = join(tmpdir(), 'out.png');
    const startupChild = new EventEmitter();
    spawnMock.mockReturnValueOnce(startupChild);
    const startupPromise = runRasterStage('sharp', pngInput, pngOutput);
    startupChild.emit('error', new Error('spawn denied'));
    await expect(startupPromise).rejects.toThrow('spawn denied');

    const exitChild = new EventEmitter();
    spawnMock.mockReturnValueOnce(exitChild);
    const exitPromise = runRasterStage(
      'resvg',
      join(tmpdir(), 'in.svg'),
      pngOutput,
    );
    exitChild.emit('exit', 9, null);
    await expect(exitPromise).rejects.toThrow(
      'Raster resvg stage failed (exit 9)',
    );

    const signalChild = new EventEmitter();
    spawnMock.mockReturnValueOnce(signalChild);
    const signalPromise = runRasterStage(
      'satori',
      join(tmpdir(), 'in.json'),
      join(tmpdir(), 'out.svg'),
    );
    signalChild.emit('exit', null, 'SIGKILL');
    await expect(signalPromise).rejects.toThrow(
      'Raster satori stage failed (signal SIGKILL)',
    );
  });

  it('kills a running stage with SIGTERM then SIGKILL when aborted', async () => {
    vi.useFakeTimers();
    try {
      const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
      spawnMock.mockReturnValue(child);
      const controller = new AbortController();

      const stagePromise = runRasterStage(
        'sharp',
        join(tmpdir(), 'in.png'),
        join(tmpdir(), 'out.png'),
        controller.signal,
      );

      controller.abort(new Error('lease lost'));
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      expect(child.kill).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');

      child.emit('exit', null, 'SIGKILL');
      await expect(stagePromise).rejects.toThrow('lease lost');
    } finally {
      vi.useRealTimers();
    }
  });
});
