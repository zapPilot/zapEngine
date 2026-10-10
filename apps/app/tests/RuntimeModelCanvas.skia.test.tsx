// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokens } from '@zapengine/design-tokens/tokens';
import { buildDrawList, engineFrame } from '@zapengine/zap-pilot-story/model';
import { RuntimeModelCanvas } from '@/components/runtime-model/RuntimeModelCanvas';
import {
  RUNTIME_MODEL_SPECS,
  type RuntimeModelSpec,
} from '@/components/runtime-model/runtimeModelSpec';
import { APP_FONTS } from '@/lib/fonts';
import { paintedTexts, skiaTestRuntime } from './support/skiaStub';

vi.mock(
  '@shopify/react-native-skia',
  async () => (await import('./support/skiaStub')).skiaStub,
);
// The real story pipeline, observed so each recorded frame can be read as story time.
vi.mock('@zapengine/zap-pilot-story/model', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@zapengine/zap-pilot-story/model')>();
  return {
    ...actual,
    engineFrame: vi.fn(actual.engineFrame),
    buildDrawList: vi.fn(actual.buildDrawList),
  };
});
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const FIRST_RUN = RUNTIME_MODEL_SPECS.firstRun;
const RUNTIME = RUNTIME_MODEL_SPECS.runtime;
const LABELS = {
  'your-strategy': '你的策略',
  'your-machine': '你的機器',
  'your-wallet': '你的錢包',
};
const frame = vi.mocked(engineFrame);
const lists = vi.mocked(buildDrawList);
const frames = new Map<number, FrameRequestCallback>();
const roots: Root[] = [];
let nextFrame = 0;
let realBuild: typeof buildDrawList;
/** The synthetic frame clock; `performance.now` follows it so frames take no measured time. */
let simulatedNow = 0;

beforeEach(async () => {
  frames.clear();
  simulatedNow = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => simulatedNow);
  skiaTestRuntime.reset();
  realBuild = (
    await vi.importActual<typeof import('@zapengine/zap-pilot-story/model')>(
      '@zapengine/zap-pilot-story/model',
    )
  ).buildDrawList;
  frame.mockClear();
  lists.mockClear();
  lists.mockImplementation(realBuild);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => frames.delete(id)),
  );
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(element: ReactElement) {
  const host = document.createElement('div');
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(element));
  return { host, render: (next: ReactElement) => act(() => root.render(next)) };
}
/** Runs the frame callbacks queued so far at timestamp `now`. */
function flush(now: number) {
  simulatedNow = now;
  const queued = [...frames.values()];
  frames.clear();
  for (const callback of queued) act(() => callback(now));
}
const shownId = (host: HTMLElement) =>
  host.querySelector('[data-picture]')?.getAttribute('data-picture');
const shown = (host: HTMLElement) =>
  skiaTestRuntime.recorded.find((p) => String(p.id) === shownId(host));
const canvas = (
  spec: RuntimeModelSpec,
  props: Partial<{
    pinLabels: Record<string, string>;
    reducedMotion: boolean;
    paused: boolean;
  }> = {},
) => (
  <RuntimeModelCanvas
    spec={spec}
    pinLabels={props.pinLabels ?? {}}
    reducedMotion={props.reducedMotion ?? false}
    paused={props.paused ?? false}
  />
);
/** A cheap stand-in list, so loop tests time the clock rather than the depth sort. */
function stubLists() {
  lists.mockImplementation((_frame, options) => ({
    width: options.layout.width,
    height: options.layout.height,
    commands: [],
  }));
}
const drawnViews = () =>
  frame.mock.calls.map(([time, ambient]) => ({ time, ambient }));

describe('Android runtime model canvas', () => {
  it('records the Runtime still once from the real drawing list', () => {
    const { host } = mount(canvas(RUNTIME));
    const stage = host.querySelector<HTMLElement>(
      '[data-testid="skia-canvas"]',
    );
    expect(stage?.style.width).toBe('390px');
    expect(stage?.style.height).toBe('300px');
    expect(shown(host)).toBeUndefined();
    flush(16);
    expect(drawnViews()).toEqual([{ time: 1, ambient: 0 }]);
    const picture = shown(host)!;
    expect(picture.bounds).toEqual({ x: 0, y: 0, width: 390, height: 300 });
    const texts = paintedTexts(picture);
    expect(texts).toEqual(
      expect.arrayContaining(['RULE 1 · FIRED', 'SIGN', 'STABLES · TARGET']),
    );
    // Runtime omits billboards: no market-data pin, no rule tags.
    expect(texts).not.toContain('MARKET DATA');
    expect(texts).not.toContain('Cross-down exit');
    expect(lists.mock.calls[0]![1].layers).toEqual(['faces', 'dial', 'dots']);
    expect(frames.size).toBe(0);
    flush(500);
    expect(skiaTestRuntime.recorded).toHaveLength(1);
  }, 20_000);

  it('shows the landed First Run frame under reduced motion with pin copy by id', () => {
    const { host } = mount(
      canvas(FIRST_RUN, { pinLabels: LABELS, reducedMotion: true }),
    );
    flush(16);
    expect(drawnViews()).toEqual([{ time: 0.09, ambient: 0 }]);
    const texts = paintedTexts(shown(host)!);
    expect(texts).toEqual(expect.arrayContaining(Object.values(LABELS)));
    // A localized pin drops its English subtitle.
    expect(texts).not.toContain('READABLE RULES');
    expect(texts).not.toContain('PLANNED · HOSTED TODAY');
    expect(lists.mock.calls[0]![1]).toMatchObject({
      pinLabels: LABELS,
      layout: {
        width: 390,
        height: 350,
        unit: 5.6,
        origin: [0.465, 0.51],
        perspectiveOrigin: [0.465, 0.42],
      },
    });
    expect(lists.mock.calls[0]![1]).not.toHaveProperty('layers');
    expect(frames.size).toBe(0);
    flush(1_000);
    expect(skiaTestRuntime.recorded).toHaveLength(1);
  }, 20_000);

  it('waits for its own Martian Mono typefaces before drawing', () => {
    skiaTestRuntime.fontsReady = false;
    const { host, render } = mount(canvas(FIRST_RUN));
    expect(frames.size).toBe(0);
    expect(shownId(host)).toBeUndefined();
    const families = [
      tokens.font.native.mono.family,
      tokens.font.native['mono-medium'].family,
      tokens.font.native['mono-semibold'].family,
    ] as const;
    expect(skiaTestRuntime.fontSources).toEqual(
      Object.fromEntries(families.map((f) => [f, [APP_FONTS[f]]])),
    );
    stubLists();
    skiaTestRuntime.fontsReady = true;
    render(canvas(FIRST_RUN));
    expect(frames.size).toBe(1);
    flush(0);
    expect(shownId(host)).toBe('1');
  });

  it('loops First Run on the shared frame grid and redraws nothing while it holds', () => {
    stubLists();
    const { host } = mount(canvas(FIRST_RUN));
    flush(0);
    flush(10);
    expect(drawnViews()).toEqual([{ time: 0, ambient: 0 }]);
    for (let now = 40; now <= 11_990; now += 30) flush(now);
    const loop = drawnViews();
    // 40 ms samples the second 30 ms grid frame; the parts drift before assembling.
    expect(loop[1]).toEqual({ time: 0, ambient: 0.03 });
    expect(loop).toHaveLength(181);
    // The landed frame is drawn once for the whole 4 s – 10.6 s hold.
    expect(loop.filter((v) => v.time === 0.09)).toHaveLength(1);
    const peak = loop.findIndex((v) => v.time === 0.09);
    const assembling = loop.slice(0, peak + 1).map((v) => v.time);
    expect(assembling).toEqual([...assembling].sort((a, b) => a - b));
    const rewinding = loop.slice(peak).map((v) => v.time);
    expect(rewinding).toEqual([...rewinding].sort((a, b) => b - a));
    expect(rewinding.at(-1)).toBeLessThan(0.001);
    expect(skiaTestRuntime.recorded).toHaveLength(loop.length);
    const landed = skiaTestRuntime.recorded[peak]!;
    // Later loops replay the same grid views from cache: no new engine frames.
    for (let now = 12_020; now <= 17_000; now += 30) flush(now);
    expect(frame.mock.calls).toHaveLength(loop.length);
    expect(skiaTestRuntime.recorded).toHaveLength(loop.length);
    expect(shown(host)).toBe(landed);
  });

  it('stops while paused and resumes where it stopped', () => {
    stubLists();
    const { render } = mount(canvas(FIRST_RUN));
    for (let now = 0; now <= 2_000; now += 30) flush(now);
    const before = drawnViews().at(-1)!;
    expect(before.time).toBeGreaterThan(0);
    render(canvas(FIRST_RUN, { paused: true }));
    expect(frames.size).toBe(0);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    const drawn = frame.mock.calls.length;
    render(canvas(FIRST_RUN, { paused: false }));
    // An hour later the loop continues from the paused moment, not the wall clock.
    flush(3_600_000);
    flush(3_600_030);
    expect(frame.mock.calls.length).toBe(drawn + 1);
    const after = drawnViews().at(-1)!;
    expect(after.time).toBeGreaterThan(before.time);
    expect(after.time - before.time).toBeLessThan(0.002);
  });

  it('leaves the JS thread idle after a frame that overran the interval', () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    lists.mockImplementation((_frame, options) => {
      clock += 100;
      return { width: options.layout.width, height: 1, commands: [] };
    });
    mount(canvas(FIRST_RUN));
    flush(0);
    expect(lists).toHaveBeenCalledTimes(1);
    for (const now of [40, 120, 190]) {
      clock = now;
      flush(now);
    }
    expect(lists).toHaveBeenCalledTimes(1);
    clock = 210;
    flush(210);
    expect(lists).toHaveBeenCalledTimes(2);
  });
});
