// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PodcastLanguageDropdown } from '@/components/content/ContentLanguageSelector';

vi.mock('nativewind', () => ({ cssInterop: vi.fn() }));

vi.mock(
  'lucide-react-native',
  async () => (await import('./support/lucideStub')).lucideStub,
);
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    accessibilityLabel,
    children,
    onPress,
  }: {
    accessibilityLabel?: string;
    children?: ReactNode;
    onPress?: () => void;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress} type="button">
      {children}
    </button>
  ),
}));

const setLanguageCode = vi.fn();

vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({
    languageCode: 'zh-Hant',
    setLanguageCode,
    t: (key: string) => key,
  }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  setLanguageCode.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function openMenuAndPick(label: string): Promise<void> {
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[aria-label="language.choose"]')
      ?.click();
  });
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
      ?.click();
  });
}

describe('PodcastLanguageDropdown', () => {
  it('displays Chinese while preserving the stored zh-Hant lane ID', async () => {
    await act(async () => root.render(<PodcastLanguageDropdown />));
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="language.choose"]')
        ?.click();
    });
    const chineseOption =
      container.querySelector<HTMLButtonElement>('[aria-label="中文"]');
    expect(chineseOption?.textContent).toContain('中文');
    await act(async () => chineseOption?.click());
    expect(setLanguageCode).toHaveBeenCalledWith('zh-Hant');
  });

  it('notifies onLanguageSelected with the picked code', async () => {
    const onLanguageSelected = vi.fn();

    await act(async () =>
      root.render(
        <PodcastLanguageDropdown onLanguageSelected={onLanguageSelected} />,
      ),
    );
    await openMenuAndPick('English');

    expect(setLanguageCode).toHaveBeenCalledWith('en');
    expect(onLanguageSelected).toHaveBeenCalledWith('en');
  });

  it('does not throw when onLanguageSelected is omitted', async () => {
    await act(async () => root.render(<PodcastLanguageDropdown />));

    await expect(openMenuAndPick('English')).resolves.toBeUndefined();
    expect(setLanguageCode).toHaveBeenCalledWith('en');
  });
});
