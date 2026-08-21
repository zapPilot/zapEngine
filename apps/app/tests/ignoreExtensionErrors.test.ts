import { describe, expect, it, vi } from 'vitest';

import {
  installExtensionErrorFilter,
  isExtensionErrorEvent,
  isExtensionOnlyRejection,
} from '@/config/ignoreExtensionErrors.web';

const EXTENSION_STACK = [
  'i: Failed to connect to MetaMask',
  '    at Object.connect (chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js:7:84292)',
].join('\n');

const MIXED_STACK = [
  'Error: boom',
  '    at doThing (http://localhost:8081/index.bundle:100:5)',
  '    at Object.connect (chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js:7:84292)',
].join('\n');

function extensionError(): Error {
  const error = new Error('Failed to connect to MetaMask');
  error.stack = EXTENSION_STACK;
  return error;
}

describe('isExtensionErrorEvent', () => {
  it('matches errors thrown from extension scripts', () => {
    expect(
      isExtensionErrorEvent({
        filename:
          'chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js',
      }),
    ).toBe(true);
  });

  it('keeps errors from the app bundle', () => {
    expect(
      isExtensionErrorEvent({ filename: 'http://localhost:8081/index.bundle' }),
    ).toBe(false);
    expect(isExtensionErrorEvent({ filename: '' })).toBe(false);
  });
});

describe('isExtensionOnlyRejection', () => {
  it('matches rejections whose stack is entirely inside extensions', () => {
    expect(isExtensionOnlyRejection(extensionError())).toBe(true);
  });

  it('keeps rejections with any app frame', () => {
    const error = new Error('boom');
    error.stack = MIXED_STACK;
    expect(isExtensionOnlyRejection(error)).toBe(false);
  });

  it('keeps non-Error and stackless reasons', () => {
    expect(isExtensionOnlyRejection('Failed to connect to MetaMask')).toBe(
      false,
    );
    expect(isExtensionOnlyRejection(null)).toBe(false);
    const stackless = new Error('boom');
    delete stackless.stack;
    expect(isExtensionOnlyRejection(stackless)).toBe(false);
  });
});

describe('installExtensionErrorFilter', () => {
  function createTarget() {
    const listeners = new Map<string, ((event: never) => void)[]>();
    const target = {
      addEventListener: (type: string, listener: (event: never) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
    };
    const dispatch = (type: string, event: unknown) => {
      listeners.get(type)?.forEach((listener) => listener(event as never));
    };
    return { target: target as Pick<Window, 'addEventListener'>, dispatch };
  }

  it('stops propagation only for extension error events', () => {
    const { target, dispatch } = createTarget();
    installExtensionErrorFilter(target);

    const extensionEvent = {
      filename: 'chrome-extension://abc/inpage.js',
      stopImmediatePropagation: vi.fn(),
    };
    const appEvent = {
      filename: 'http://localhost:8081/index.bundle',
      stopImmediatePropagation: vi.fn(),
    };
    dispatch('error', extensionEvent);
    dispatch('error', appEvent);

    expect(extensionEvent.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(appEvent.stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it('stops propagation only for extension-only rejections', () => {
    const { target, dispatch } = createTarget();
    installExtensionErrorFilter(target);

    const extensionEvent = {
      reason: extensionError(),
      stopImmediatePropagation: vi.fn(),
    };
    const appError = new Error('boom');
    appError.stack = MIXED_STACK;
    const appEvent = {
      reason: appError,
      stopImmediatePropagation: vi.fn(),
    };
    dispatch('unhandledrejection', extensionEvent);
    dispatch('unhandledrejection', appEvent);

    expect(extensionEvent.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(appEvent.stopImmediatePropagation).not.toHaveBeenCalled();
  });
});
