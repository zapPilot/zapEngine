// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { engineFrame } from '@zapengine/zap-pilot-story/model';
import { RuntimeModelStage } from '@/components/runtime-model/RuntimeModelStage';
import { RuntimeModelStage as IosStage } from '@/components/runtime-model/RuntimeModelStage.ios';
import { RuntimeModelCanvas as IosCanvas } from '@/components/runtime-model/RuntimeModelCanvas.ios';
import {
  RUNTIME_MODEL_SPECS,
  type RuntimeModelCanvasProps,
} from '@/components/runtime-model/runtimeModelSpec';
import type { ContentLanguageCode } from '@/config/contentLanguages';

const state = vi.hoisted(() => ({
  focused: true,
  reducedMotion: false,
  language: 'en' as ContentLanguageCode,
  appState: 'active',
  listeners: new Set<(status: string) => void>(),
  canvas: vi.fn((_props: RuntimeModelCanvasProps) => null),
}));
vi.mock('react-native', () => ({
  View: ({
    children,
    className,
    style,
  }: {
    children: ReactNode;
    className: string;
    style: CSSProperties;
  }) => (
    <div className={className} style={style}>
      {children}
    </div>
  ),
  AppState: {
    get currentState() {
      return state.appState;
    },
    addEventListener: (_type: 'change', listener: (s: string) => void) => {
      state.listeners.add(listener);
      return { remove: () => state.listeners.delete(listener) };
    },
  },
}));
vi.mock('expo-router', () => ({ useIsFocused: () => state.focused }));
vi.mock('@/components/ui/useReducedMotion', () => ({
  useReducedMotion: () => state.reducedMotion,
}));
vi.mock('@/providers/ContentLanguageProvider', async () => {
  const { TRANSLATIONS } = await import('@/i18n/translations');
  const { createTranslator } = await import('@/lib/i18n');
  return {
    useContentLanguage: () => ({
      t: createTranslator(TRANSLATIONS[state.language]),
    }),
  };
});
vi.mock('@/components/runtime-model/RuntimeModelCanvas', () => ({
  RuntimeModelCanvas: state.canvas,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  Object.assign(state, {
    focused: true,
    reducedMotion: false,
    language: 'en',
    appState: 'active',
  });
  state.canvas.mockClear();
});
function mount(node: ReactNode) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(() => root.render(next)),
    unmount: () => act(() => root.unmount()),
  };
}
const drawn = () => state.canvas.mock.lastCall![0];
function setAppState(status: string) {
  state.appState = status;
  act(() => {
    for (const listener of state.listeners) listener(status);
  });
}

it('sizes a container to each spec and hands the canvas its spec and motion preference', () => {
  for (const variant of ['firstRun', 'runtime'] as const) {
    state.reducedMotion = variant === 'runtime';
    const { host, unmount } = mount(<RuntimeModelStage variant={variant} />);
    const spec = RUNTIME_MODEL_SPECS[variant];
    const container = host.firstElementChild as HTMLElement;
    expect([container.style.width, container.style.height]).toEqual([
      `${spec.width}px`,
      `${spec.height}px`,
    ]);
    expect(container.className).toBe('self-center overflow-hidden');
    expect(drawn()).toMatchObject({
      spec,
      reducedMotion: variant === 'runtime',
      paused: false,
    });
    unmount();
  }
});

it('localizes the First Run pins by story id and gives Runtime none', () => {
  const expected = {
    en: ['Your strategy', 'Your machine', 'Your wallet'],
    'zh-Hant': ['你的策略', '你的機器', '你的錢包'],
    ja: ['あなたの戦略', 'あなたのマシン', 'あなたのウォレット'],
  } as const;
  for (const language of ['en', 'zh-Hant', 'ja'] as const) {
    state.language = language;
    mount(<RuntimeModelStage variant="firstRun" />).unmount();
    expect(drawn().pinLabels).toEqual({
      'your-strategy': expected[language][0],
      'your-machine': expected[language][1],
      'your-wallet': expected[language][2],
    });
  }
  mount(<RuntimeModelStage variant="runtime" />).unmount();
  expect(drawn().pinLabels).toEqual({});
});

it('translates every pin the First Run loop can draw, and only those', () => {
  // The loop and its reduced-motion still never leave story time 0 – 0.09.
  const ids = new Set<string>();
  for (let step = 0; step <= 900; step++)
    for (const pin of engineFrame(step / 10_000).pins) ids.add(pin.id);
  mount(<RuntimeModelStage variant="firstRun" />).unmount();
  expect(Object.keys(drawn().pinLabels).sort()).toEqual([...ids].sort());
});

it('pauses while the screen is unfocused or the app is in the background', () => {
  const view = mount(<RuntimeModelStage variant="firstRun" />);
  expect(drawn().paused).toBe(false);
  setAppState('background');
  expect(drawn().paused).toBe(true);
  setAppState('active');
  expect(drawn().paused).toBe(false);
  state.focused = false;
  view.rerender(<RuntimeModelStage variant="firstRun" />);
  expect(drawn().paused).toBe(true);
  view.unmount();
  expect(state.listeners.size).toBe(0);
  state.focused = true;
  state.appState = 'inactive';
  mount(<RuntimeModelStage variant="runtime" />).unmount();
  expect(drawn().paused).toBe(true);
});

it('draws nothing on iOS, whose stage and canvas import no scene code', () => {
  const { host, unmount } = mount(
    <>
      <IosStage />
      <IosCanvas />
    </>,
  );
  expect(host.innerHTML).toBe('');
  unmount();
  for (const file of [
    'RuntimeModelStage.ios.tsx',
    'RuntimeModelCanvas.ios.tsx',
  ])
    expect(
      readFileSync(
        path.resolve(__dirname, '../src/components/runtime-model', file),
        'utf8',
      ),
    ).not.toMatch(/^\s*(import|export .* from)\b/m);
});
