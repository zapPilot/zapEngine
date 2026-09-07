import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import {
  cropMediaImage,
  rasterizeBrandFrame,
  rasterizeOutro,
  runRasterStage,
} from './rasterizer.js';

afterEach(() => {
  spawnMock.mockReset();
});

describe('portrait card rasterization', () => {
  it('writes the frame stage input and runs satori, resvg, then sharp-scale', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rasterizer-frame-test-'));
    const paths = {
      input: join(directory, 'work', 'frame.json'),
      svg: join(directory, 'work', 'frame.svg'),
      master: join(directory, 'master', 'frame.png'),
      output: join(directory, 'out', 'frame.png'),
    };
    const frame = { kicker: '鏈上快訊', titleLines: ['世界盃最賺錢的生意'] };
    const output = { width: 720, height: 1280 };
    const calls: string[] = [];
    let satoriPayload: unknown;
    const runStage = vi.fn(
      async (stage: string, input: string, stageOutput: string) => {
        if (stage === 'satori') {
          satoriPayload = JSON.parse(await readFile(input, 'utf8'));
        }
        calls.push(`${stage}:${input}->${stageOutput}`);
        await writeFile(stageOutput, stage, 'utf8');
      },
    );

    await rasterizeBrandFrame(frame, output, paths, { runStage });

    expect(satoriPayload).toEqual({ kind: 'frame', frame, output });
    expect(JSON.parse(await readFile(paths.input, 'utf8'))).toEqual({
      imagePath: paths.master,
      ...output,
    });
    expect(calls).toEqual([
      `satori:${paths.input}->${paths.svg}`,
      `resvg:${paths.svg}->${paths.master}`,
      `sharp-scale:${paths.input}->${paths.output}`,
    ]);
  });

  it('writes the outro stage input with its own kind', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rasterizer-outro-test-'));
    const paths = {
      input: join(directory, 'outro.json'),
      svg: join(directory, 'outro.svg'),
      master: join(directory, 'master', 'outro.png'),
      output: join(directory, 'out', 'outro.png'),
    };
    const outro = { title: 'From Fed to Chain', callToAction: '訂閱・分享' };
    const output = { width: 720, height: 1280 };
    const stages: string[] = [];
    let satoriPayload: unknown;
    const runStage = vi.fn(async (stage: string, input: string) => {
      if (stage === 'satori') {
        satoriPayload = JSON.parse(await readFile(input, 'utf8'));
      }
      stages.push(stage);
    });

    await rasterizeOutro(outro, output, paths, { runStage });

    expect(satoriPayload).toEqual({ kind: 'outro', outro, output });
    expect(JSON.parse(await readFile(paths.input, 'utf8'))).toEqual({
      imagePath: paths.master,
      ...output,
    });
    expect(stages).toEqual(['satori', 'resvg', 'sharp-scale']);
  });
});

describe('cropMediaImage', () => {
  it('uses runRasterStage by default', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rasterizer-crop-default-'));
    const child = new EventEmitter();
    spawnMock.mockReturnValue(child);
    const promise = cropMediaImage(
      {
        imagePath: join(directory, 'source.png'),
        width: 100,
        height: 100,
        position: 'center',
      },
      {
        input: join(directory, 'crop.json'),
        output: join(directory, 'out.png'),
      },
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    child.emit('exit', 0, null);
    await promise;
  });

  it('writes the crop parameters and runs only the sharp-crop stage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rasterizer-crop-test-'));
    const paths = {
      input: join(directory, 'crop.json'),
      output: join(directory, 'out', 'scene.png'),
    };
    const crop = {
      imagePath: join(directory, 'scene-source.png'),
      width: 1_080,
      height: 960,
      position: 'top' as const,
    };
    const calls: string[] = [];
    const runStage = vi.fn(
      async (stage: string, input: string, output: string) => {
        calls.push(`${stage}:${input}->${output}`);
      },
    );

    await cropMediaImage(crop, paths, { runStage });

    expect(JSON.parse(await readFile(paths.input, 'utf8'))).toEqual(crop);
    expect(calls).toEqual([`sharp-crop:${paths.input}->${paths.output}`]);
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
    const startupPromise = runRasterStage('sharp-crop', pngInput, pngOutput);
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

  it('rejects immediately on abort when the child exposes no kill method', async () => {
    const child = new EventEmitter();
    spawnMock.mockReturnValue(child);
    const controller = new AbortController();
    const promise = runRasterStage(
      'satori',
      join(tmpdir(), 'in.json'),
      join(tmpdir(), 'out.svg'),
      controller.signal,
    );

    controller.abort(new Error('cancelled without kill'));
    await expect(promise).rejects.toThrow('cancelled without kill');
    child.emit('exit', 0, null);
  });

  it('normalizes a child startup error after an abort into the abort reason', async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    spawnMock.mockReturnValue(child);
    const controller = new AbortController();
    const promise = runRasterStage(
      'resvg',
      join(tmpdir(), 'in.svg'),
      join(tmpdir(), 'out.png'),
      controller.signal,
    );

    controller.abort(new Error('lease revoked'));
    child.emit('error', new Error('spawn failed after abort'));
    await expect(promise).rejects.toThrow('lease revoked');
  });

  it('ignores a later error after a successful exit has already settled', async () => {
    const child = new EventEmitter();
    spawnMock.mockReturnValue(child);
    const promise = runRasterStage(
      'satori',
      join(tmpdir(), 'in.json'),
      join(tmpdir(), 'out.svg'),
    );
    child.emit('exit', 0, null);
    child.emit('error', new Error('too late'));
    await expect(promise).resolves.toBeUndefined();
  });

  it('kills a running stage with SIGTERM then SIGKILL when aborted', async () => {
    vi.useFakeTimers();
    try {
      const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
      spawnMock.mockReturnValue(child);
      const controller = new AbortController();

      const stagePromise = runRasterStage(
        'sharp-crop',
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
