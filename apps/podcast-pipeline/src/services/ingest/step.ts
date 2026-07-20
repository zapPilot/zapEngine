import { AsyncLocalStorage } from 'node:async_hooks';

const STEP_HEARTBEAT_INTERVAL_MS = 15_000;

export interface StepLogContext {
  runId?: string;
  languageCode?: string;
  localizationIndex?: number;
  localizationTotal?: number;
}

type IngestLogDetails = Record<string, string | number | boolean | undefined>;

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

export function logIngestEvent(
  event: string,
  details: IngestLogDetails = {},
): void {
  logIngestEventWithContext(event, details, stepLogContext.getStore());
}

function logIngestEventWithContext(
  event: string,
  details: IngestLogDetails,
  context: Readonly<StepLogContext> | undefined,
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

  console.log(`[/ingest] ${event}${suffix ? ` ${suffix}` : ''}`);
}

export async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const context = stepLogContext.getStore();
  logIngestEventWithContext('step:start', { name }, context);

  const heartbeat = setInterval(() => {
    logIngestEventWithContext(
      'step:waiting',
      {
        name,
        elapsedMs: Date.now() - startedAt,
      },
      context,
    );
  }, STEP_HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  try {
    const result = await fn();
    logIngestEventWithContext(
      'step:done',
      {
        name,
        elapsedMs: Date.now() - startedAt,
      },
      context,
    );
    return result;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logIngestEventWithContext(
      'step:failed',
      {
        name,
        elapsedMs: Date.now() - startedAt,
        error: err.message,
      },
      context,
    );
    const wrapped = new Error(`[step:${name}] ${err.message}`, { cause: err });
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
