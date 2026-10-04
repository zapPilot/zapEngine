import { describe, expect, it } from 'vitest';
import { compareVersions } from '@/lib/version';
import {
  appStoreIdFromUrl,
  fromDesktopState,
  fromStoreVersions,
  parseAppStoreLookup,
} from '@/integration/appUpdate';
describe('app version model', () => {
  it('compares numeric dotted versions', () => {
    for (const [a, b, result] of [
      ['3.0.1', '3.0.0', 1],
      ['0.2.0', '0.2.1', -1],
      ['1.10', '1.9', 1],
      ['1.0', '1', 0],
      ['1', '1.0', 0],
      ['01.002', '1.2', 0],
    ] as const)
      expect(compareVersions(a, b)).toBe(result);
    for (const invalid of ['', '1.x', '1.0-beta', '1..2', ' 1', '-1']) {
      expect(compareVersions(invalid, '1')).toBeUndefined();
      expect(compareVersions('1', invalid)).toBeUndefined();
    }
  });
  it('maps store availability and missing versions', () => {
    expect(fromStoreVersions(null)).toEqual({ status: 'hidden' });
    expect(fromStoreVersions('1')).toEqual({
      status: 'version-only',
      currentVersion: '1',
    });
    expect(fromStoreVersions('1', 'bad').status).toBe('version-only');
    expect(fromStoreVersions('1', '2')).toEqual({
      status: 'available',
      currentVersion: '1',
      latestVersion: '2',
    });
    expect(fromStoreVersions('2', '1').status).toBe('up-to-date');
    expect(fromStoreVersions('1', '1').status).toBe('up-to-date');
  });
  it('validates lookup payloads and extracts only Apple listing ids', () => {
    expect(
      parseAppStoreLookup({ resultCount: 1, results: [{ version: '3.0.0' }] }),
    ).toBe('3.0.0');
    for (const payload of [
      null,
      {},
      { resultCount: 0, results: [] },
      { resultCount: 1, results: [] },
      { resultCount: 1, results: [{ version: 'bad' }] },
    ])
      expect(parseAppStoreLookup(payload)).toBeUndefined();
    expect(appStoreIdFromUrl('https://apps.apple.com/app/id6749248542')).toBe(
      '6749248542',
    );
    for (const url of [
      'bad',
      'https://evil.com/app/id1',
      'https://apps.apple.com/app/name',
    ])
      expect(appStoreIdFromUrl(url)).toBeUndefined();
  });
  it('maps every desktop state', () => {
    const currentVersion = '0.2.0';
    for (const [status, view] of [
      ['idle', 'version-only'],
      ['checking', 'checking'],
      ['up-to-date', 'up-to-date'],
      ['error', 'error'],
    ] as const)
      expect(fromDesktopState({ status, currentVersion }).status).toBe(view);
    for (const [status, view] of [
      ['available', 'available'],
      ['downloaded', 'ready'],
      ['installing', 'installing'],
    ] as const)
      expect(
        fromDesktopState({ status, currentVersion, version: '0.2.1' }).status,
      ).toBe(view);
    expect(
      fromDesktopState({
        status: 'downloading',
        currentVersion,
        version: '0.2.1',
        percent: 42,
      }),
    ).toEqual({ status: 'downloading', currentVersion, percent: 42 });
    for (const [reason, status] of [
      ['dev', 'version-only'],
      ['location', 'move-to-applications'],
    ] as const)
      expect(
        fromDesktopState({ status: 'unsupported', reason, currentVersion })
          .status,
      ).toBe(status);
  });
});

it('native desktop stub stays inert', async () => {
  const { useDesktopUpdate } = await import('@/integration/desktopBridge');
  const bridge = useDesktopUpdate();
  expect(bridge.state).toBeUndefined();
  bridge.update();
  bridge.install();
  bridge.retry();
});
