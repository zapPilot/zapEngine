import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { runProcess } from './ffmpeg-video.js';

afterEach(() => {
  spawnMock.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function spawnPipedChild() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    stdout,
    stderr,
  });
  spawnMock.mockReturnValue(child);
  return child;
}

// Stream data events land a tick after write(), while emit('exit') is
// synchronous — without this the exit handler would read an empty buffer.
async function flushStreams(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

async function captureFailure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected the process to fail');
}

describe('runProcess abort handling', () => {
  it('sends SIGTERM immediately and escalates to SIGKILL after the grace window', async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    spawnMock.mockReturnValue(child);
    const controller = new AbortController();

    const promise = runProcess(
      '/opt/ffmpeg',
      ['-i', 'input'],
      true,
      controller.signal,
    );

    controller.abort(new Error('lease lost'));
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(child.kill).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');

    child.emit('exit', null, 'SIGTERM');
    await expect(promise).rejects.toThrow('lease lost');
  });

  it('throws before spawning when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('shutdown'));

    await expect(
      runProcess('/opt/ffmpeg', ['-i', 'input'], true, controller.signal),
    ).rejects.toThrow();
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe('runProcess failure reporting', () => {
  it('names the OOM killer and leads with the last stderr line', async () => {
    const child = spawnPipedChild();

    const promise = runProcess('/usr/bin/ffmpeg', ['-i', 'input'], true);
    child.stderr.write('frame=  201 fps=0.1 q=23.0\r');
    child.stderr.write('Error while filtering: Cannot allocate memory\n');
    await flushStreams();
    child.emit('exit', null, 'SIGKILL');

    // The Linux OOM killer prints nothing the child can see, so the SIGKILL is
    // the only clue and the message has to spell it out.
    await expect(promise).rejects.toThrow(
      '/usr/bin/ffmpeg failed (signal SIGKILL, likely out of memory): Error while filtering: Cannot allocate memory',
    );
  });

  it('keeps the first line self-contained and appends the full tail', async () => {
    const child = spawnPipedChild();

    const promise = runProcess('/usr/bin/ffmpeg', ['-i', 'input'], true);
    child.stderr.write('Input #0 broken\nConversion failed!\n');
    await flushStreams();
    child.emit('exit', 1, null);

    // Telegram only surfaces the first line of a stored last_error.
    await expect(promise).rejects.toThrow(
      '/usr/bin/ffmpeg failed (exit 1): Conversion failed!\nInput #0 broken\nConversion failed!',
    );
  });

  it('relays streamed output live while retaining only a bounded tail', async () => {
    const child = spawnPipedChild();
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const promise = runProcess('/usr/bin/ffmpeg', ['-i', 'input'], true);
    child.stderr.write(`${'noise\n'.repeat(4_000)}Conversion failed!\n`);
    await flushStreams();
    child.emit('exit', 1, null);
    const failure = await captureFailure(promise);

    expect(failure.message).toMatch(/Conversion failed!/);
    expect(stderrWrite).toHaveBeenCalled();
    // A multi-minute render emits a -stats line per second, so the retained
    // copy must not grow without bound.
    expect(failure.message.length).toBeLessThan(9_000);
  });

  it('retains the whole of a captured run so capability probes stay complete', async () => {
    const child = spawnPipedChild();

    const promise = runProcess('/usr/bin/ffmpeg', ['-filters']);
    child.stdout.write(`${'x'.repeat(20_000)}\nxfade\n`);
    await flushStreams();
    child.emit('exit', 0, null);

    const result = await promise;
    expect(result.stdout).toHaveLength(20_007);
    expect(result.stdout).toContain('xfade');
  });
});
