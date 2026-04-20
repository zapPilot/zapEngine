import { createRequestLoggerMiddleware } from '@common/middleware/logger.middleware';
import type { MockInstance } from 'vitest';

function makeContext(status: number, headers: Record<string, string> = {}) {
  return {
    req: {
      method: 'GET',
      path: '/test',
      header: (name: string) => headers[name.toLowerCase()] ?? undefined,
    },
    res: { status },
  };
}

describe('createRequestLoggerMiddleware', () => {
  let infoSpy: MockInstance;
  let warnSpy: MockInstance;
  let errorSpy: MockInstance;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('calls next()', async () => {
    const middleware = createRequestLoggerMiddleware();
    const next = vi.fn().mockResolvedValue(undefined);
    const c = makeContext(200);

    await middleware(c as never, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('logs INFO (console.info) for 2xx responses', async () => {
    const middleware = createRequestLoggerMiddleware();
    const next = vi.fn().mockResolvedValue(undefined);
    const c = makeContext(200);

    await middleware(c as never, next);

    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs WARN (console.warn) for 4xx responses', async () => {
    const middleware = createRequestLoggerMiddleware();
    const next = vi.fn().mockResolvedValue(undefined);
    const c = makeContext(404);

    await middleware(c as never, next);

    expect(warnSpy).toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs ERROR (console.error) for 5xx responses', async () => {
    const middleware = createRequestLoggerMiddleware();
    const next = vi.fn().mockResolvedValue(undefined);
    const c = makeContext(500);

    await middleware(c as never, next);

    expect(errorSpy).toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('includes method, path, and status code in the log message', async () => {
    const middleware = createRequestLoggerMiddleware();
    const next = vi.fn().mockResolvedValue(undefined);
    const c = makeContext(201);

    await middleware(c as never, next);

    const line: string = infoSpy.mock.calls[0][0];
    expect(line).toContain('GET');
    expect(line).toContain('/test');
    expect(line).toContain('201');
  });

  it('uses x-forwarded-for header for the IP', async () => {
    const middleware = createRequestLoggerMiddleware();
    const next = vi.fn().mockResolvedValue(undefined);
    const c = makeContext(200, { 'x-forwarded-for': 'forwarded-client' });

    await middleware(c as never, next);

    expect(infoSpy.mock.calls[0][0]).toContain('forwarded-client');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    const middleware = createRequestLoggerMiddleware();
    const next = vi.fn().mockResolvedValue(undefined);
    const c = makeContext(200, { 'x-real-ip': 'real-client' });

    await middleware(c as never, next);

    expect(infoSpy.mock.calls[0][0]).toContain('real-client');
  });

  it('uses "unknown" when no IP header is present', async () => {
    const middleware = createRequestLoggerMiddleware();
    const next = vi.fn().mockResolvedValue(undefined);
    const c = makeContext(200);

    await middleware(c as never, next);

    expect(infoSpy.mock.calls[0][0]).toContain('unknown');
  });
});
