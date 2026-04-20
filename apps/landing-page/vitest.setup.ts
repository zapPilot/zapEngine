import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { createFramerMotionMock } from './src/test-utils/mocks/framer-motion';
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
).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

vi.mock('next/image', () => nextImageMock);
vi.mock('framer-motion', () => createFramerMotionMock());
