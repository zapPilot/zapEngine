import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { runProcess } from './ffmpeg-video.js';

afterEach(() => {
  spawnMock.mockReset();
  vi.useRealTimers();
});

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
