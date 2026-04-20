import { beforeEach, vi } from 'vitest';

Object.defineProperty(globalThis, 'TextEncoder', {
  value: TextEncoder,
  writable: true,
});

Object.defineProperty(globalThis, 'TextDecoder', {
  value: TextDecoder,
  writable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
});
