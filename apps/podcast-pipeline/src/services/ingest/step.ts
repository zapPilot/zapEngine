import { AsyncLocalStorage } from 'node:async_hooks';

const STEP_HEARTBEAT_INTERVAL_MS = 15_000;

export interface StepLogContext {
  runId?: string;
  languageCode?: string;
  localizationIndex?: number;
  localizationTotal?: number;
}

export type LogDetails = Record<string, string | number | boolean | undefined>;

const stepLogContext = new AsyncLocalStorage<StepLogContext>();

export async function withStepLogContext<T>(
  context: StepLogContext,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = stepLogContext.getStore() ?? {};
  return stepLogContext.run({ ...parent, ...context }, fn);
}

export function getStepLogContext(): Readonly<StepLogContext> | undefined {
  return stepLogContext.getStore();
}

export function logPipelineEvent(
  prefix: string,
  event: string,
  details: LogDetails = {},
): void {
  logEventWithContext(prefix, event, details, stepLogContext.getStore());
}

export function logIngestEvent(event: string, details: LogDetails = {}): void {
  logEventWithContext('[/ingest]', event, details, stepLogContext.getStore());
}

/**
 * Resident set size of the API process, in MiB.
 *
 * Attached to the long-running ingest events so the `app` machine's memory
 * limit can be sized from measured peaks (`fly logs | grep rssMb`) rather than
 * from the history of the co-located ffmpeg era. `process.memoryUsage.rss()` is
 * the cheap variant — it reads RSS without collecting heap statistics.
 */
export function currentRssMb(): number {
  return Math.round(process.memoryUsage.rss() / 1_048_576);
}

function logEventWithContext(
  prefix: string,
  event: string,
  details: LogDetails,
  context?: Readonly<StepLogContext>,
): void {
  const fields = [
    ...contextLogFields(context),
    ...Object.entries(details).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value] as const],
    ),
  ];
  const suffix = fields
    .map(([key, value]) => `${key}=${formatLogValue(value)}`)
    .join(' ');

  console.log(`${prefix} ${event}${suffix ? ` ${suffix}` : ''}`);
}

export async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const context = stepLogContext.getStore();
  logEventWithContext('[/ingest]', 'step:start', { name }, context);

  const heartbeat = setInterval(() => {
    logEventWithContext(
      '[/ingest]',
      'step:waiting',
      {
        name,
        elapsedMs: Date.now() - startedAt,
        rssMb: currentRssMb(),
      },
      context,
    );
  }, STEP_HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  try {
    const result = await fn();
    logEventWithContext(
      '[/ingest]',
      'step:done',
      {
        name,
        elapsedMs: Date.now() - startedAt,
        rssMb: currentRssMb(),
      },
      context,
    );
    return result;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logEventWithContext(
      '[/ingest]',
      'step:failed',
      {
        name,
        elapsedMs: Date.now() - startedAt,
        error: err.message,
      },
      context,
    );
    const wrapped = new Error(`[step:${name}] ${err.message}`, { cause: err });
    // Carried as a property, not parsed back out of the message, so a failure
    // reported to Sentry at the terminal boundary can be tagged with the step
    // that actually failed.
    (wrapped as { stepName?: string }).stepName = name;
    const meta = (err as { $metadata?: unknown }).$metadata;
    if (meta !== undefined) {
      (wrapped as { $metadata?: unknown }).$metadata = meta;
    }
    throw wrapped;
  } finally {
    clearInterval(heartbeat);
  }
}

export function logIngestSkip(reason: string): void {
  logIngestEvent('skip', { reason });
}

function contextLogFields(
  context: Readonly<StepLogContext> | undefined,
): (readonly [string, string | number])[] {
  const fields: (readonly [string, string | number])[] = [];

  if (context?.runId) {
    fields.push(['run', context.runId]);
  }

  if (context?.languageCode) {
    fields.push(['language', context.languageCode]);
  }

  if (
    context?.localizationIndex !== undefined &&
    context.localizationTotal !== undefined
  ) {
    fields.push([
      'progress',
      `${context.localizationIndex}/${context.localizationTotal}`,
    ]);
  }

  return fields;
}

function formatLogValue(value: string | number | boolean): string {
  return String(value).replace(/\s+/gu, '_');
}

/** The name of the `step()` that failed, if the error came from one. */
export function failedStepName(error: unknown): string | undefined {
  const name = (error as { stepName?: unknown } | null)?.stepName;
  return typeof name === 'string' ? name : undefined;
}
