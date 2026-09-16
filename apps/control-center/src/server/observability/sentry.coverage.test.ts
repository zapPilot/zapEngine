import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  captureException: sentryMocks.captureException,
  withScope: vi.fn(
    (callback: (scope: { setTag: typeof sentryMocks.setTag }) => void) =>
      callback({ setTag: sentryMocks.setTag }),
  ),
}));

import { captureServerException } from './sentry.js';

describe('sentry route tag coverage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tags only the method when the route is absent', () => {
    const error = new Error('method only');
    captureServerException(error, { method: 'POST' });

    expect(sentryMocks.setTag).toHaveBeenCalledTimes(1);
    expect(sentryMocks.setTag).toHaveBeenCalledWith('http.method', 'POST');
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });

  it('captures without tags when neither method nor route is given', () => {
    const error = new Error('bare');
    captureServerException(error, {});

    expect(sentryMocks.setTag).not.toHaveBeenCalled();
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });

  it('captures with the default empty context', () => {
    const error = new Error('default context');
    captureServerException(error);

    expect(sentryMocks.setTag).not.toHaveBeenCalled();
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });
});
