import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from 'openai';
import { describe, expect, it } from 'vitest';

import {
  classifyScriptCompletionError,
  isRetryableOpenRouterError,
} from './llm.js';

/**
 * Every case here builds a real SDK instance rather than an object literal
 * shaped like one. A hand-made `{ name: 'APIConnectionError' }` is what let a
 * name-based classifier ship: the SDK's classes all inherit the plain 'Error'
 * name, so the fabricated shape passed a test that production traffic could
 * never satisfy.
 */
function sdkError(status: number, message: string): APIError {
  return APIError.generate(status, undefined, message, new Headers());
}

/** The per-request deadline in `combineAbortSignalWithTimeout`, not an SDK type. */
function deadlineTimeout(): Error {
  const error = new Error('OpenRouter request timed out after 600000ms');
  error.name = 'TimeoutError';
  return error;
}

/** A provider reachable only through an HTTP status, with no SDK involved. */
function providerErrorWithStatus(status: number): Error {
  return Object.assign(new Error(`provider responded ${status}`), { status });
}

describe('SDK error shapes the classifiers depend on', () => {
  it('gives every transport failure the plain Error name and no status', () => {
    for (const error of [
      new APIConnectionError({ message: 'Connection error.' }),
      new APIConnectionTimeoutError({ message: 'Request timed out.' }),
      new APIUserAbortError(),
    ]) {
      expect(error.name).toBe('Error');
      expect(error.status).toBeUndefined();
      expect(error).toBeInstanceOf(APIError);
    }
  });

  it('keeps the timeout subclass under the connection base, and aborts outside it', () => {
    expect(new APIConnectionTimeoutError({ message: 't' })).toBeInstanceOf(
      APIConnectionError,
    );
    expect(new APIUserAbortError()).not.toBeInstanceOf(APIConnectionError);
  });
});

describe('isRetryableOpenRouterError', () => {
  it('retries a real SDK connection failure', () => {
    expect(
      isRetryableOpenRouterError(
        new APIConnectionError({ message: 'Connection error.' }),
      ),
    ).toBe(true);
  });

  it('retries a real SDK request timeout', () => {
    expect(
      isRetryableOpenRouterError(
        new APIConnectionTimeoutError({ message: 'Request timed out.' }),
      ),
    ).toBe(true);
  });

  it('retries the per-request deadline timeout', () => {
    expect(isRetryableOpenRouterError(deadlineTimeout())).toBe(true);
  });

  it('retries the transient SDK status errors', () => {
    expect(isRetryableOpenRouterError(sdkError(429, 'slow down'))).toBe(true);
    expect(isRetryableOpenRouterError(sdkError(408, 'too slow'))).toBe(true);
    expect(isRetryableOpenRouterError(sdkError(500, 'boom'))).toBe(true);
    expect(isRetryableOpenRouterError(sdkError(502, 'bad gateway'))).toBe(true);
  });

  it('retries a non-SDK provider that only reports a status', () => {
    expect(isRetryableOpenRouterError(providerErrorWithStatus(503))).toBe(true);
    expect(isRetryableOpenRouterError(providerErrorWithStatus(400))).toBe(
      false,
    );
  });

  it('does not retry a request the caller cancelled', () => {
    expect(isRetryableOpenRouterError(new APIUserAbortError())).toBe(false);
  });

  it('does not retry a terminal SDK status error', () => {
    expect(isRetryableOpenRouterError(sdkError(400, 'bad request'))).toBe(
      false,
    );
    expect(isRetryableOpenRouterError(sdkError(401, 'no key'))).toBe(false);
    expect(isRetryableOpenRouterError(sdkError(404, 'no model'))).toBe(false);
  });

  it('does not retry a non-object or an unclassified error', () => {
    expect(isRetryableOpenRouterError('provider exploded')).toBe(false);
    expect(isRetryableOpenRouterError(undefined)).toBe(false);
    expect(isRetryableOpenRouterError(new Error('unusable payload'))).toBe(
      false,
    );
  });
});

describe('classifyScriptCompletionError', () => {
  it('calls a real SDK connection failure retry_safe', () => {
    expect(
      classifyScriptCompletionError(
        new APIConnectionError({ message: 'Connection error.' }),
      ),
    ).toBe('retry_safe');
  });

  it('calls a real SDK request timeout a timeout, not a connection failure', () => {
    expect(
      classifyScriptCompletionError(
        new APIConnectionTimeoutError({ message: 'Request timed out.' }),
      ),
    ).toBe('timeout');
  });

  it('calls the per-request deadline timeout a timeout', () => {
    expect(classifyScriptCompletionError(deadlineTimeout())).toBe('timeout');
  });

  it('calls the transient SDK status errors retry_safe', () => {
    expect(classifyScriptCompletionError(sdkError(429, 'slow down'))).toBe(
      'retry_safe',
    );
    expect(classifyScriptCompletionError(sdkError(502, 'bad gateway'))).toBe(
      'retry_safe',
    );
  });

  it('calls a cancelled request terminal rather than re-routing it', () => {
    expect(classifyScriptCompletionError(new APIUserAbortError())).toBe(
      'terminal',
    );
  });

  it('calls a terminal SDK status error terminal', () => {
    expect(classifyScriptCompletionError(sdkError(400, 'bad request'))).toBe(
      'terminal',
    );
    expect(classifyScriptCompletionError(sdkError(401, 'no key'))).toBe(
      'terminal',
    );
  });

  it('calls a non-object or an unclassified error terminal', () => {
    expect(classifyScriptCompletionError('provider exploded')).toBe('terminal');
    expect(classifyScriptCompletionError(null)).toBe('terminal');
    expect(classifyScriptCompletionError(new Error('unusable payload'))).toBe(
      'terminal',
    );
  });
});

describe('the SDK subclasses a real deployment actually throws', () => {
  it('routes each one by its status, not its name', () => {
    const rateLimit = APIError.generate(
      429,
      undefined,
      'slow down',
      new Headers(),
    );
    const serverError = APIError.generate(
      500,
      undefined,
      'boom',
      new Headers(),
    );
    const badRequest = APIError.generate(
      400,
      undefined,
      'bad request',
      new Headers(),
    );

    expect(rateLimit).toBeInstanceOf(RateLimitError);
    expect(serverError).toBeInstanceOf(InternalServerError);
    expect(badRequest).toBeInstanceOf(BadRequestError);

    expect(isRetryableOpenRouterError(rateLimit)).toBe(true);
    expect(isRetryableOpenRouterError(serverError)).toBe(true);
    expect(isRetryableOpenRouterError(badRequest)).toBe(false);

    expect(classifyScriptCompletionError(rateLimit)).toBe('retry_safe');
    expect(classifyScriptCompletionError(serverError)).toBe('retry_safe');
    expect(classifyScriptCompletionError(badRequest)).toBe('terminal');
  });
});
