import fs from 'node:fs';
import path from 'node:path';

import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';

import { chartMatchers } from '../utils/chartTypeGuards';

const coverageTmpDir = path.join(process.cwd(), 'coverage', '.tmp');
if (!fs.existsSync(coverageTmpDir)) {
  fs.mkdirSync(coverageTmpDir, { recursive: true });
}

configure({
  asyncTimeout: 5000,
});

global.IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error;

beforeEach(() => {
  console.error = (...args: any[]) => {
    const message = args[0];
    if (
      typeof message === 'string' &&
      (message.includes('not configured to support act') ||
        message.includes('Warning: ReactDOM.render is no longer supported'))
    ) {
      return;
    }
    originalConsoleError.call(console, ...args);
  };
});

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryErrorResetBoundary: () => ({ reset: vi.fn() }),
  };
});

expect.extend(matchers);
expect.extend(chartMatchers);

afterEach(() => {
  cleanup();
});

afterEach(() => {
  console.error = originalConsoleError;
});

afterEach(() => {
  vi.useRealTimers();
});
