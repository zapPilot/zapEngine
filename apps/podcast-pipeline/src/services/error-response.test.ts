import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleAppError } from './error-response.js';

function appThrowing(error: unknown): Hono {
  const app = new Hono();
  app.get('/boom', () => {
    throw error;
  });
  app.onError(handleAppError);
  return app;
}

describe('handleAppError', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const originalNodeEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    if (originalNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalNodeEnv;
    }
  });

  it('passes HTTPException responses through unchanged', async () => {
    const app = appThrowing(new HTTPException(400, { message: 'bad request' }));

    const res = await app.request('/boom');

    expect(res.status).toBe(400);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('includes debug fields in development, with an Error cause expanded', async () => {
    process.env['NODE_ENV'] = 'development';
    const error = new Error('boom', { cause: new Error('root cause') });
    const app = appThrowing(error);

    const res = await app.request('/boom');
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body['error']).toBe('Internal server error');
    expect(body['message']).toBe('boom');
    expect(body['cause']).toMatchObject({
      name: 'Error',
      message: 'root cause',
    });
  });

  it('passes a non-Error cause through verbatim in development', async () => {
    process.env['NODE_ENV'] = 'development';
    const error = new Error('boom', { cause: 'string-cause' });
    const app = appThrowing(error);

    const res = await app.request('/boom');
    const body = (await res.json()) as Record<string, unknown>;

    expect(body['cause']).toBe('string-cause');
  });

  it('omits debug fields in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const app = appThrowing(new Error('boom', { cause: new Error('inner') }));

    const res = await app.request('/boom');
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'Internal server error' });
  });
});
