import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getStepLogContext,
  logIngestEvent,
  step,
  withStepLogContext,
} from './step.js';

describe('step', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('logs start and completion with elapsed time and inherited context', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await withStepLogContext(
      {
        runId: 'run-1234',
        languageCode: 'zh-Hant',
        localizationIndex: 1,
        localizationTotal: 3,
      },
      async () => {
        const work = step('generateScript', async () => {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 42);
          });
          return 'script';
        });

        await vi.advanceTimersByTimeAsync(42);
        return work;
      },
    );

    expect(result).toBe('script');
    expect(log).toHaveBeenNthCalledWith(
      1,
      '[/ingest] step:start run=run-1234 language=zh-Hant progress=1/3 name=generateScript',
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      '[/ingest] step:done run=run-1234 language=zh-Hant progress=1/3 name=generateScript elapsedMs=42',
    );
  });

  it('logs a heartbeat every 15 seconds and clears it when work completes', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    let resolveWork: (() => void) | undefined;

    const work = withStepLogContext({ runId: 'run-1234' }, () =>
      step(
        'generateScript',
        () =>
          new Promise<void>((resolve) => {
            resolveWork = resolve;
          }),
      ),
    );

    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    resolveWork?.();
    await work;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(log.mock.calls.map(([message]) => message)).toEqual([
      '[/ingest] step:start run=run-1234 name=generateScript',
      '[/ingest] step:waiting run=run-1234 name=generateScript elapsedMs=15000',
      '[/ingest] step:waiting run=run-1234 name=generateScript elapsedMs=30000',
      '[/ingest] step:done run=run-1234 name=generateScript elapsedMs=30000',
    ]);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('logs failure while preserving the original cause and AWS metadata', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const metadata = { httpStatusCode: 503, requestId: 'request-1234' };
    const original = Object.assign(new Error('service unavailable'), {
      $metadata: metadata,
    });

    const work = step('uploadHlsToR2', async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 25);
      });
      throw original;
    });
    const rejection = expect(work).rejects.toMatchObject({
      message: '[step:uploadHlsToR2] service unavailable',
      cause: original,
      $metadata: metadata,
    });
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(log.mock.calls.map(([message]) => message)).toEqual([
      '[/ingest] step:start name=uploadHlsToR2',
      '[/ingest] step:failed name=uploadHlsToR2 elapsedMs=25 error=service_unavailable',
    ]);
  });
});

describe('ingest step log context', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges nested contexts and exposes flat event logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await withStepLogContext(
      {
        runId: 'run-1234',
        localizationIndex: 1,
        localizationTotal: 3,
      },
      async () => {
        await withStepLogContext({ languageCode: 'ja' }, async () => {
          expect(getStepLogContext()).toEqual({
            runId: 'run-1234',
            languageCode: 'ja',
            localizationIndex: 1,
            localizationTotal: 3,
          });
          logIngestEvent('llm:request', {
            model: 'google/gemini-2.5-pro',
            thinking: true,
            inputChars: 128,
            timeoutMs: 120_000,
          });
        });
      },
    );

    expect(getStepLogContext()).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      '[/ingest] llm:request run=run-1234 language=ja progress=1/3 model=google/gemini-2.5-pro thinking=true inputChars=128 timeoutMs=120000',
    );
  });
});
