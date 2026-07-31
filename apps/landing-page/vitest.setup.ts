import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { nextImageMock } from './src/test-utils/mocks/next-image';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// jsdom ships no PointerEvent, so fireEvent.pointerMove degrades to a generic
// Event and silently drops clientX — pointer assertions would read undefined.
// MouseEvent is captured first because `'PointerEvent' in window` narrows the
// negative branch to never (lib.dom declares the property unconditionally).
const mouseEventCtor = window.MouseEvent;
if (!('PointerEvent' in window)) {
  Object.defineProperty(window, 'PointerEvent', {
    writable: true,
    configurable: true,
    value: mouseEventCtor,
  });
}

Object.defineProperty(window, 'gtag', {
  writable: true,
  configurable: true,
  value: vi.fn(),
});

class MockIntersectionObserver {
  disconnect(): void {}
  observe(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve(): void {}
}

(
  globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }
).IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver;

vi.mock('next/image', () => nextImageMock);
