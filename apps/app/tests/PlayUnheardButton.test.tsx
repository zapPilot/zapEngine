// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  PlayUnheardButton,
  type PlayUnheardMode,
} from '@/components/listen/PlayUnheardButton';
import { createPodcastEpisode } from './support/podcastEpisode';
vi.mock('lucide-react-native', () => ({
  RotateCcw: () => null,
  RotateCw: () => null,
  ChevronDown: () => null,
  Pause: () => null,
  Play: () => null,
}));
vi.mock(
  'react-native',
  async () => (await import('./support/reactNativeStub')).reactNativeStub,
);
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { en } = await import('./support/i18nHarness');
  return { useContentLanguage: () => ({ t: en }) };
});
vi.mock('@/components/ui/Icon', () => ({ Icon: () => null }));
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock('@/components/ui/IconButton', () => ({
  IconButton: ({
    onPress,
    accessibilityLabel,
  }: {
    onPress: () => void;
    accessibilityLabel: string;
  }) => <button data-play aria-label={accessibilityLabel} onClick={onPress} />,
}));
vi.mock('@/components/ui/ActionSheet', () => ({
  ActionSheet: ({
    visible,
    onClose,
    actions,
  }: {
    visible: boolean;
    onClose: () => void;
    actions: { id: string; label: string; onPress: () => void }[];
  }) =>
    visible ? (
      <div role="dialog">
        {actions.map((action) => (
          <button
            key={action.id}
            data-order={action.id}
            onClick={() => {
              onClose();
              action.onPress();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    ) : null,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it.each([
  'same',
  'different',
  'language',
  'null',
  'allCompleted',
  'unplayed',
  'empty',
] as const)(
  'preserves playback and order controls for %s',
  async (scenario) => {
    const target = createPodcastEpisode({
      title: 'Intended queue target',
      lastPositionSeconds: 93,
    });
    const activeEpisode = ['null', 'allCompleted', 'unplayed'].includes(
      scenario,
    )
      ? null
      : createPodcastEpisode({
          localizationId:
            scenario === 'different' ? 'other' : target.localizationId,
          languageCode: scenario === 'language' ? 'ja' : target.languageCode,
        });
    const mode: PlayUnheardMode =
      scenario === 'empty' ||
      scenario === 'allCompleted' ||
      scenario === 'unplayed'
        ? scenario
        : 'inProgress';
    const onPlay = vi.fn();
    const onOpen = vi.fn();
    const onDirectionChange = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <PlayUnheardButton
            mode={mode}
            target={scenario === 'empty' ? null : target}
            activeEpisode={activeEpisode}
            direction="newest"
            isPlaying={false}
            onPlay={onPlay}
            onOpen={onOpen}
            onDirectionChange={onDirectionChange}
          />,
        ),
      );
      if (scenario === 'empty') {
        expect(host.textContent).toBe('');
        return;
      }
      const same = scenario === 'same';
      expect(host.querySelector('[data-play]') === null).toBe(same);
      if (!same) {
        await act(async () =>
          (host.querySelector('[data-play]') as HTMLButtonElement).click(),
        );
        expect(onPlay).toHaveBeenCalledOnce();
        await act(async () =>
          Array.from(host.querySelectorAll('button'))
            .find((button) =>
              button.getAttribute('aria-label')?.includes(target.title),
            )!
            .click(),
        );
        expect(onOpen).toHaveBeenCalledOnce();
      }
      await act(async () =>
        Array.from(host.querySelectorAll('button'))
          .find((button) => button.textContent === 'Newest')!
          .click(),
      );
      await act(async () =>
        (
          host.querySelector('[data-order="oldest"]') as HTMLButtonElement
        ).click(),
      );
      expect(onDirectionChange).toHaveBeenCalledWith('oldest');
      expect(host.querySelector('[role="dialog"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  },
);
