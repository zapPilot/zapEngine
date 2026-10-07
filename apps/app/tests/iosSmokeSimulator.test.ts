import { describe, expect, it, vi } from 'vitest';
import playwrightConfig from '../playwright.config';
import { createSmokeSimulator } from '../scripts/ios-smoke-simulator.mjs';

const template = {
  udid: 'shared-device',
  name: 'iPhone 17 Pro',
  state: 'Booted',
  deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro',
  runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-26-5',
};

describe('isolated iOS smoke simulator', () => {
  it('keeps Playwright cleanup inside its own artifact directory', () => {
    expect(playwrightConfig.outputDir).toBe('./test-results/playwright');
  });
  it('creates its own device instead of borrowing a booted simulator', () => {
    const capture = vi.fn(() => ({
      status: 0,
      stdout: 'owned-device\n',
      stderr: '',
    }));
    const simulator = createSmokeSimulator(template, capture);
    expect(capture).toHaveBeenCalledWith('xcrun', [
      'simctl',
      'create',
      expect.stringContaining('Zap Pilot smoke'),
      template.deviceTypeIdentifier,
      template.runtime,
    ]);
    expect(simulator).toMatchObject({
      udid: 'owned-device',
      state: 'Shutdown',
      runtime: template.runtime,
    });
    expect(template.udid).toBe('shared-device');
    expect(template.state).toBe('Booted');
  });

  it.each([
    { status: 1, stdout: '', stderr: 'runtime unavailable' },
    { status: 0, stdout: '\n', stderr: '' },
  ])(
    'fails rather than falling back to a shared device when creation fails',
    (result) => {
      expect(() => createSmokeSimulator(template, () => result)).toThrow(
        'Unable to create an isolated iOS simulator',
      );
    },
  );
});
