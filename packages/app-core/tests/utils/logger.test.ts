import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  mode: 'development',
  values: {} as Record<string, string | undefined>,
}));

vi.mock('@core/lib/env/runtimeEnv', () => ({
  isRuntimeMode: (mode: string) => env.mode === mode,
  getRuntimeEnv: (key: string) => env.values[key],
}));

import { Logger, LogLevel } from '@core/utils/logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    env.mode = 'development';
    env.values = {};
  });

  it('resolves development defaults lazily and caches configuration', () => {
    const logger = new Logger();
    expect(logger.getConfig()).toMatchObject({
      level: LogLevel.DEBUG,
      enableConsole: true,
      enableDebugInProduction: false,
      enableDevLogging: true,
      maxLocalLogs: 1000,
    });

    env.mode = 'production';
    expect(logger.getLevel()).toBe(LogLevel.DEBUG);
  });

  it('uses WARN in production unless debug logging is explicitly enabled', () => {
    env.mode = 'production';
    const quiet = new Logger();
    expect(quiet.getConfig()).toMatchObject({
      level: LogLevel.WARN,
      enableConsole: false,
      enableDebugInProduction: false,
    });

    env.values.VITE_ENABLE_DEBUG_LOGGING = 'true';
    const debug = new Logger();
    expect(debug.getConfig()).toMatchObject({
      level: LogLevel.DEBUG,
      enableConsole: true,
      enableDebugInProduction: true,
    });
  });

  it('honors disabled dev logging and explicit constructor overrides', () => {
    env.values.VITE_ENABLE_DEV_LOGGING = 'false';
    const logger = new Logger({
      level: LogLevel.ERROR,
      enableConsole: false,
      maxLocalLogs: 2,
    });
    expect(logger.getConfig()).toMatchObject({
      level: LogLevel.ERROR,
      enableConsole: false,
      enableDevLogging: false,
      maxLocalLogs: 2,
    });
  });

  it('filters levels below the active threshold', () => {
    const logger = new Logger({ level: LogLevel.WARN, enableConsole: false });
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');
    expect(logger.getLogs().map((entry) => entry.message)).toEqual([
      'warn',
      'error',
    ]);
  });

  it('writes every console level with formatted context, data, and errors', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger({ enableConsole: true, level: LogLevel.DEBUG });

    logger.debug('debug', { a: 1 }, 'Ctx');
    logger.info('info', 0, '');
    logger.warn('warn');
    logger.error('error', new Error('boom'), 'ErrCtx');

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('DEBUG [Ctx] debug {"a":1}'),
    );
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('INFO info'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('WARN warn'));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ERROR [ErrCtx] error Error: boom'),
    );
  });

  it('treats non-Error error payloads as data', () => {
    const logger = new Logger({ enableConsole: false });
    logger.error('failure', { code: 500 }, 'API');
    expect(logger.getLogs()[0]).toMatchObject({
      message: 'failure',
      data: { code: 500 },
      context: 'API',
    });
    expect(logger.getLogs()[0]?.error).toBeUndefined();
  });

  it('keeps only maxLocalLogs and returns defensive copies', () => {
    const logger = new Logger({ enableConsole: false, maxLocalLogs: 2 });
    logger.info('one');
    logger.info('two');
    logger.info('three');
    const logs = logger.getLogs();
    expect(logs.map((entry) => entry.message)).toEqual(['two', 'three']);
    logs.pop();
    expect(logger.getLogs()).toHaveLength(2);
    logger.clearLogs();
    expect(logger.getLogs()).toEqual([]);
  });

  it('supports runtime level and console changes', () => {
    const logger = new Logger({ enableConsole: false });
    logger.setLevel(LogLevel.ERROR);
    logger.setConsoleLogging(true);
    expect(logger.getLevel()).toBe(LogLevel.ERROR);
    expect(logger.getConfig().enableConsole).toBe(true);
  });

  it('binds all context logger methods to the supplied context', () => {
    const logger = new Logger({ enableConsole: false });
    const context = logger.createContextLogger('Wallet');
    context.debug('debug', { a: 1 });
    context.info('info');
    context.warn('warn');
    context.error('error', new Error('boom'));

    expect(logger.getLogs()).toHaveLength(4);
    expect(logger.getLogs().every((entry) => entry.context === 'Wallet')).toBe(
      true,
    );
    expect(logger.getLogs()[3]?.error?.message).toBe('boom');
  });
});
