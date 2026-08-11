// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PodcastLanguageDropdown } from '@/components/content/ContentLanguageSelector';

vi.mock('lucide-react-native', () => ({
  Check: () => null,
  ChevronDown: () => null,
}));

vi.mock('react-native', () => ({
  Modal: ({
    visible,
    children,
  }: {
    visible?: boolean;
    children?: ReactNode;
  }) => (visible ? <div>{children}</div> : null),
  Pressable: ({
    accessibilityLabel,
    onPress,
    children,
  }: {
    accessibilityLabel?: string;
    onPress?: () => void;
    children?: ReactNode;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress} type="button">
      {children}
    </button>
  ),
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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
