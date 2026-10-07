// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenEpisodeInApp } from '@/components/podcast/OpenEpisodeInApp.web';
import { OpenEpisodeInApp as NativePrompt } from '@/components/podcast/OpenEpisodeInApp';

vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    onPress,
  }: {
    children: ReactNode;
    onPress: () => void;
  }) => <button onClick={onPress}>{children}</button>,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderPrompt(userAgent: string, maxTouchPoints = 0) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    value: maxTouchPoints,
  });
  await act(async () =>
    root.render(
      <>
        <OpenEpisodeInApp localizationId="episode/en" languageCode="en" />
        <p>Episode content</p>
      </>,
    ),
  );
}

describe('web episode app prompt', () => {
  it.each([
    ['iPhone', 0],
    ['iPad', 0],
    ['Android', 0],
    ['Macintosh; Intel Mac OS X', 5],
    ['iPhone Instagram', 0],
    ['Android FBAV', 0],
  ])('offers an explicit app link on %s', async (ua, touches) => {
    await renderPrompt(ua, touches);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'zappilotv2://podcast/episode%2Fen?lang=en',
    );
    expect(container.querySelector('button')?.textContent).toBe(
      'podcast.continueInBrowser',
    );
    expect(container.textContent).toContain('Episode content');
  });

  it.each(['Macintosh; Intel Mac OS X', 'Windows NT', 'Linux x86_64'])(
    'does not show app controls on desktop %s',
    async (ua) => {
      await renderPrompt(ua);
      expect(container.querySelector('a')).toBeNull();
      expect(container.querySelector('button')).toBeNull();
    },
  );

  it('dismisses the prompt without removing content or navigating', async () => {
    await renderPrompt('iPhone');
    const url = window.location.href;
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('Episode content');
    expect(window.location.href).toBe(url);
  });

  it('updates the app destination when episode language changes', async () => {
    await renderPrompt('Android');
    await act(async () =>
      root.render(
        <OpenEpisodeInApp localizationId="episode-ja" languageCode="ja" />,
      ),
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'zappilotv2://podcast/episode-ja?lang=ja',
    );
  });

  it('does not render inside the native app', () => {
    expect(
      NativePrompt({ localizationId: 'episode-en', languageCode: 'en' }),
    ).toBeNull();
  });
});
