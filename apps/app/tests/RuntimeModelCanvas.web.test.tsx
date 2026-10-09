// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { tokens } from '@zapengine/design-tokens/tokens';
import { EngineWorld } from '@zapengine/zap-pilot-story/engine-world';
import { RuntimeModelCanvas } from '@/components/runtime-model/RuntimeModelCanvas.web';
import {
  RUNTIME_MODEL_SPECS,
  type RuntimeModelSpec,
} from '@/components/runtime-model/runtimeModelSpec';

// The real landing renderer, observed so animated frames can be read as story time.
vi.mock('@zapengine/zap-pilot-story/engine-world', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@zapengine/zap-pilot-story/engine-world')
    >();
  return { EngineWorld: vi.fn(actual.EngineWorld) };
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
const world = vi.mocked(EngineWorld);
const frames = new Map<number, FrameRequestCallback>();
const roots: Root[] = [];
let nextFrame = 0;
beforeEach(() => {
  frames.clear();
  world.mockClear();
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
});
function mount(element: ReactElement) {
  const host = document.createElement('div');
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(element));
  return { host, render: (next: ReactElement) => act(() => root.render(next)) };
}
function canvas(
  spec: RuntimeModelSpec,
  options: { reducedMotion?: boolean; paused?: boolean } = {},
) {
  return (
    <RuntimeModelCanvas
      spec={spec}
      pinLabels={spec.layers === 'full' ? LABELS : {}}
      reducedMotion={options.reducedMotion ?? false}
      paused={options.paused ?? false}
    />
  );
}
/** The landing renderer itself, at a story time, on the spec's camera. */
function landingStage(spec: RuntimeModelSpec, time: number): string {
  return mount(
    <EngineWorld
      time={time}
      veil={false}
      layers={
        spec.layers === 'full'
          ? ['faces', 'dial', 'dots', 'tags', 'pins']
          : ['faces', 'dial', 'dots']
      }
      origin={[spec.origin.x, spec.origin.y]}
      perspectiveOrigin={[spec.pivot.x, spec.pivot.y]}
      pinLabels={spec.layers === 'full' ? LABELS : {}}
    />,
  ).host.innerHTML;
}
function tick(now: number) {
  expect(frames.size).toBe(1);
  const [id, callback] = [...frames][0]!;
  frames.delete(id);
  act(() => callback(now));
}
const drawn = () => {
  const { time, ambient } = world.mock.lastCall![0];
  return { time, ambient };
};
const stageOf = (host: HTMLElement) => host.firstElementChild as HTMLElement;
const pinOpacities = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('.zp-blb')].map(
    (pin) => pin.style.opacity,
  );

it('freezes First Run on the landing stage at t = 0.09 under reduced motion', () => {
  const { host } = mount(canvas(FIRST_RUN, { reducedMotion: true }));
  expect(stageOf(host).innerHTML).toBe(landingStage(FIRST_RUN, 0.09));
  expect(
    [...host.querySelectorAll('.zp-blb-box')].map((box) => box.textContent),
  ).toEqual(['你的策略', '你的機器', '你的錢包']);
  expect(host.querySelector('.zp-veil')).toBeNull();
  expect(requestAnimationFrame).not.toHaveBeenCalled();
});

it('sizes the stage from the spec and supplies night tokens without .zp-stage', () => {
  const { host } = mount(canvas(FIRST_RUN, { reducedMotion: true }));
  const stage = stageOf(host);
  expect([stage.style.width, stage.style.height, stage.style.overflow]).toEqual(
    ['390px', '350px', 'hidden'],
  );
  const variable = (name: string) => stage.style.getPropertyValue(name);
  expect(variable('--zp-u')).toBe('5.6px');
  expect(variable('--zp-frame-x')).toBe('0px');
  for (const [role, value] of Object.entries(tokens.mode.night))
    expect(variable(`--${role}`), role).toBe(value);
  for (const [role, value] of Object.entries(tokens.material.night))
    expect(variable(`--material-${role}`), role).toBe(value);
  for (const [sleeve, value] of Object.entries(tokens.sleeve.night))
    expect(variable(`--sleeve-${sleeve}`), sleeve).toBe(value);
  expect(variable('--font-mono')).toContain(
    tokens.font.native['mono-medium'].family,
  );
  expect(host.querySelector('.zp-stage')).toBeNull();
});

it('draws Runtime as a still of the finished model with faces, dial and dots only', () => {
  const { host } = mount(canvas(RUNTIME));
  const stage = stageOf(host);
  expect(stage.innerHTML).toBe(landingStage(RUNTIME, 1));
  expect(stage.style.height).toBe('300px');
  expect(stage.querySelectorAll('.zp-fc').length).toBeGreaterThan(0);
  expect(stage.querySelector('.zp-dial3d')).not.toBeNull();
  expect(stage.querySelectorAll('.zp-dot3d').length).toBeGreaterThan(0);
  expect(stage.querySelector('.zp-blb, .zp-tag3d, .zp-veil')).toBeNull();
  expect(requestAnimationFrame).not.toHaveBeenCalled();
});

it('loops the First Run assembly: float, click together, hold, drift apart', () => {
  const { host } = mount(canvas(FIRST_RUN));
  expect(drawn()).toEqual({ time: 0, ambient: 0 });
  expect(pinOpacities(host)).toEqual([]);
  tick(1000);
  // 2.4 s in, the ramp is halfway to 0.09 and the parts still bob.
  tick(3400);
  expect(drawn().time).toBeCloseTo(0.045, 10);
  expect(drawn().ambient).toBeCloseTo(2.4, 10);
  expect(pinOpacities(host)).toEqual(['0.25']);
  // Frames closer than 30 ms apart are skipped.
  tick(3410);
  expect(pinOpacities(host)).toEqual(['0.25']);
  tick(3440);
  expect(pinOpacities(host)).toEqual(['0.306']);
  tick(6000);
  expect(drawn()).toEqual({ time: 0.09, ambient: 0 });
  expect(pinOpacities(host)).toEqual(['1', '1', '1']);
  // Holding the docked frame does not re-render the scene.
  const renders = world.mock.calls.length;
  tick(10000);
  expect(world.mock.calls.length).toBe(renders);
  tick(12900);
  expect(drawn().time).toBeLessThan(0.001);
  expect(pinOpacities(host)).toEqual([]);
  tick(15400);
  expect(drawn().time).toBeCloseTo(0.045, 10);
});

it('pauses without losing its place and stops for reduced motion', () => {
  const { render } = mount(canvas(FIRST_RUN));
  tick(0);
  tick(2400);
  const frozen = drawn();
  expect(frozen.time).toBeCloseTo(0.045, 10);
  render(canvas(FIRST_RUN, { paused: true }));
  expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(0);
  expect(drawn()).toEqual(frozen);
  render(canvas(FIRST_RUN));
  // Time spent paused does not count.
  tick(100_000);
  expect(drawn()).toEqual(frozen);
  tick(102_600);
  expect(drawn()).toEqual({ time: 0.09, ambient: 0 });
  render(canvas(FIRST_RUN, { reducedMotion: true }));
  expect(frames.size).toBe(0);
  expect(drawn()).toEqual({ time: 0.09, ambient: 0 });
});
