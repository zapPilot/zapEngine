import type { Mock as VitestMock } from 'vitest';

declare global {
  type Mock = VitestMock;
}

export {};
