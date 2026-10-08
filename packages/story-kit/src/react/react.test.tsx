import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cut } from '../test/fixtures.js';
import { parseKinetic } from '../kinetic.js';
import {
  FixedStage,
  KineticText,
  StoryPlayer,
  useAnimationFrame,
  useReducedMotion,
  useThrottledFrame,
} from './index.js';
let callbacks: Map<number, FrameRequestCallback>;
let next: number;
let media: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  callbacks = new Map();
  next = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      callbacks.set(++next, cb);
      return next;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => callbacks.delete(id)),
  );
  media = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function frame(now: number) {
  const pending = [...callbacks.values()];
  callbacks.clear();
  act(() => pending.forEach((cb) => cb(now)));
}
it('renders accessible kinetic markup, both underline shapes and a fixed SSR stage', () => {
  const lines = parseKinetic([
    ['Rules', 'decide.|o'],
    ['You|m', 'sign.|s'],
  ]);
  const html = renderToString(
    <FixedStage width={1920} height={1080}>
      <KineticText lines={lines} progress={0.5} />
    </FixedStage>,
  );
  expect(html).toContain('Rules decide. You sign.');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('--sk-w:1920');
  expect(html).not.toContain('sk-underline');
  const underlined = [
    { ...lines[0]!, underline: 'rule' as const },
    { ...lines[1]!, underline: 'signature' as const },
  ];
  const view = render(
    <KineticText lines={underlined} progress={0.5} exit={true} reveal />,
  );
  expect(view.container.querySelectorAll('svg')).toHaveLength(2);
  expect(
    view.container
      .querySelector('[data-underline="rule"] path')
      ?.getAttribute('d'),
  ).toBe('M6 30H394');
  expect(view.container.querySelector('[data-reveal="true"]')).not.toBeNull();
});
it('schedules, updates and cancels frames and suppresses equal memo keys', () => {
  const callback = vi.fn();
  const hook = renderHook(
    ({ enabled }) => useAnimationFrame(callback, enabled),
    { initialProps: { enabled: false } },
  );
  expect(callbacks.size).toBe(0);
  hook.rerender({ enabled: true });
  frame(1);
  expect(callback).toHaveBeenCalledWith(1);
  hook.unmount();
  expect(callbacks.size).toBe(0);
  const throttle = renderHook(() =>
    useThrottledFrame((now) => Math.floor(now / 50), String, 0),
  );
  frame(0);
  frame(10);
  expect(throttle.result.current).toBe(0);
  frame(30);
  expect(throttle.result.current).toBe(0);
  frame(60);
  expect(throttle.result.current).toBe(1);
});
it('subscribes to reduced-motion changes and removes the listener', () => {
  const hook = renderHook(() => useReducedMotion());
  expect(hook.result.current).toBe(false);
  const listener = media.addEventListener.mock.calls[0]![1] as () => void;
  act(() => {
    media.matches = true;
    listener();
  });
  expect(hook.result.current).toBe(true);
  hook.unmount();
  expect(media.removeEventListener).toHaveBeenCalledWith('change', listener);
});
it('drives film/deck controls, keyboard, scrubber and print pages', () => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const onStop = vi.fn();
  const view = render(
    <StoryPlayer
      cut={cut}
      render={(time) => <span data-testid="time">{time}</span>}
      onStop={onStop}
    />,
  );
  const player = view.container.querySelector('.sk-player')!;
  expect(onStop).toHaveBeenCalledWith(0);
  frame(0);
  frame(100);
  expect(view.getByTestId('time').textContent).toBe('0.10000000000000142');
  fireEvent.click(view.getByRole('button', { name: 'Pause' }));
  expect(view.getByRole('button', { name: 'Play' })).toBeDefined();
  fireEvent.click(view.getByRole('button', { name: 'Play' }));
  fireEvent.click(view.getByRole('button', { name: 'Next slide' }));
  expect(window.location.hash).toBe('#slide-02');
  frame(900);
  expect(view.getByTestId('time').textContent).toBe('20.5');
  fireEvent.click(view.getByRole('button', { name: 'Previous slide' }));
  frame(900);
  fireEvent.click(view.getByRole('button', { name: 'Film' }));
  fireEvent.click(view.getByRole('button', { name: 'Deck' }));
  frame(900);
  fireEvent.keyDown(player, { key: 'End' });
  frame(900);
  expect(window.location.hash).toBe('#slide-03');
  fireEvent.keyDown(player, { key: 'Home' });
  frame(900);
  expect(window.location.hash).toBe('#slide-01');
  fireEvent.keyDown(player, { key: 'x' });
  const range = view.getByRole('slider');
  fireEvent.keyDown(range, { key: 'End' });
  expect(window.location.hash).toBe('#slide-01');
  fireEvent.change(range, { target: { value: '30' } });
  expect(view.getByTestId('time').textContent).toBe('30');
  act(() => {
    window.dispatchEvent(new Event('beforeprint'));
    // Browsers take their print snapshot before the native handler returns.
    expect(view.container.querySelectorAll('.sk-print-page')).toHaveLength(3);
  });
  expect(view.container.querySelector('style')?.textContent).toContain(
    '1920px 1080px',
  );
  act(() => window.dispatchEvent(new Event('afterprint')));
  expect(view.container.querySelector('.sk-print')).toBeNull();
  view.unmount();
  expect(callbacks.size).toBe(0);
});
it('opens direct slide links paused, reads hash changes, and renders without a stop callback', () => {
  window.history.replaceState(null, '', '#slide-02');
  const view = render(
    <StoryPlayer
      cut={cut}
      render={(time) => <span data-testid="time">{time}</span>}
    />,
  );
  expect(view.getByTestId('time').textContent).toBe('20.5');
  expect(view.getByRole('button', { name: 'Play' })).toBeDefined();
  act(() => {
    window.history.replaceState(null, '', '#slide-03');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(view.getByTestId('time').textContent).toBe('46');
  act(() => {
    window.history.replaceState(null, '', '#other');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(view.getByTestId('time').textContent).toBe('46');
});
it('stops at the poster when reduced motion is enabled', () => {
  media.matches = true;
  const view = render(
    <StoryPlayer
      cut={cut}
      render={(time) => <span data-testid="time">{time}</span>}
    />,
  );
  expect(view.getByTestId('time').textContent).toBe('20.5');
  expect(view.getByRole('button', { name: 'Play' })).toBeDefined();
});
