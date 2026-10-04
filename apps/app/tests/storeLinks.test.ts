import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  vi.resetModules();
  vi.doUnmock('expo-constants');
});
it('reads canonical platform URLs and tolerates missing native config', async () => {
  for (const expoConfig of [
    undefined,
    {},
    { ios: {}, android: {} },
    { ios: { appStoreUrl: 'apple' }, android: { playStoreUrl: 'play' } },
  ]) {
    vi.resetModules();
    vi.doMock('expo-constants', () => ({ default: { expoConfig } }));
    const { STORE_LINKS } = await import('@/config/storeLinks');
    expect(STORE_LINKS).toEqual({
      appStore: expoConfig?.ios?.appStoreUrl,
      googlePlay: expoConfig?.android?.playStoreUrl,
    });
  }
});
