import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDesktopUpdater, isUpdateSupported } from '../src/main/updater';
class Engine extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  allowDowngrade = true;
  checkForUpdates = vi.fn(async () => {});
  downloadUpdate = vi.fn(async () => {});
  quitAndInstall = vi.fn();
}
function setup() {
  const engine = new Engine(),
    publish = vi.fn(),
    onError = vi.fn();
  const updater = createDesktopUpdater({
    engine,
    currentVersion: '0.2.0',
    publish,
    onError,
  });
  return { engine, publish, onError, updater };
}
afterEach(() => vi.useRealTimers());
describe('desktop updates', () => {
  it('enforces support prerequisites', () => {
    const input = {
      isPackaged: true,
      platform: 'darwin',
      hasUpdateConfig: true,
      inApplicationsFolder: true,
    };
    expect(isUpdateSupported(input)).toBeUndefined();
    for (const change of [
      { isPackaged: false },
      { platform: 'linux' },
      { hasUpdateConfig: false },
    ])
      expect(isUpdateSupported({ ...input, ...change })).toBe('dev');
    expect(isUpdateSupported({ ...input, inApplicationsFolder: false })).toBe(
      'location',
    );
  });
  it('keeps unsigned and dev builds inert', async () => {
    const updater = createDesktopUpdater({
      currentVersion: '0.2.0',
      publish: vi.fn(),
      onError: vi.fn(),
      reason: 'location',
    });
    expect(updater.getState()).toEqual({
      status: 'unsupported',
      reason: 'location',
      currentVersion: '0.2.0',
    });
    updater.start();
    await updater.check();
    await updater.download();
    updater.install();
    updater.stop();
  });
  it('requires explicit downloads and installation, publishes integer progress only', async () => {
    const { engine, publish, updater } = setup();
    expect([
      engine.autoDownload,
      engine.autoInstallOnAppQuit,
      engine.allowPrerelease,
      engine.allowDowngrade,
    ]).toEqual([false, false, false, false]);
    await updater.download();
    updater.install();
    expect(engine.downloadUpdate).not.toHaveBeenCalled();
    expect(engine.quitAndInstall).not.toHaveBeenCalled();
    await updater.check();
    expect(updater.getState().status).toBe('checking');
    await updater.check();
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(1);
    engine.emit('update-available', { version: '0.2.1' });
    await updater.download();
    engine.emit('download-progress', { percent: 12.7 });
    const count = publish.mock.calls.length;
    engine.emit('download-progress', { percent: 12.9 });
    engine.emit('download-progress', { percent: NaN });
    expect(publish).toHaveBeenCalledTimes(count);
    engine.emit('download-progress', { percent: 130 });
    expect(updater.getState()).toMatchObject({ percent: 100 });
    updater.install();
    expect(engine.quitAndInstall).not.toHaveBeenCalled();
    engine.emit('update-downloaded', { version: '0.2.1' });
    await updater.check();
    updater.install();
    expect(updater.getState().status).toBe('installing');
    expect(engine.quitAndInstall).toHaveBeenCalledOnce();
    updater.stop();
    expect(engine.listenerCount('error')).toBe(0);
  });
  it('throttles successful checks and schedules startup and periodic checks', async () => {
    vi.useFakeTimers();
    const { engine, updater } = setup();
    updater.start();
    updater.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(engine.checkForUpdates).toHaveBeenCalledOnce();
    engine.emit('checking-for-update');
    engine.emit('update-not-available');
    expect(updater.getState().status).toBe('up-to-date');
    await updater.check();
    expect(engine.checkForUpdates).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(600_000);
    await updater.check();
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(2);
    engine.emit('update-not-available');
    await vi.advanceTimersByTimeAsync(21_600_000);
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(3);
    updater.stop();
  });
  it('deduplicates errors and reports rejected operations', async () => {
    const { engine, updater, onError } = setup();
    engine.checkForUpdates.mockRejectedValueOnce({ code: 'network' });
    await updater.check();
    expect(updater.getState().status).toBe('error');
    engine.emit('error', { code: 'network' });
    expect(onError).toHaveBeenCalledOnce();
    engine.emit('error', 'unknown');
    expect(onError).toHaveBeenCalledTimes(2);
    engine.emit('update-available', { version: '0.2.1' });
    engine.downloadUpdate.mockRejectedValueOnce(new Error('download failed'));
    await updater.download();
    expect(updater.getState()).toMatchObject({
      status: 'error',
      version: '0.2.1',
    });
    engine.emit('update-downloaded', { version: '0.2.1' });
    engine.quitAndInstall.mockImplementation(() => {
      throw Object.assign(new Error('install'), { code: 'install' });
    });
    updater.install();
    expect(updater.getState().status).toBe('error');
    engine.emit('download-progress', { percent: 50 });
    updater.stop();
  });
});
