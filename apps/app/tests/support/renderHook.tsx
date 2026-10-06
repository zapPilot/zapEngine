import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach } from 'vitest';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups = new Set<() => void>();
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
});

/** Small hook harness using the same React DOM runtime as the app's UI tests. */
export function renderHook<T>(hook: () => T) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let value: T;
  const Capture = () => {
    value = hook();
    return null;
  };
  const rerender = () => act(() => root.render(createElement(Capture)));
  const unmount = () => {
    act(() => root.unmount());
    container.remove();
    cleanups.delete(unmount);
  };
  cleanups.add(unmount);
  rerender();
  return {
    result: {
      get current() {
        return value;
      },
    },
    rerender,
    unmount,
  };
}
