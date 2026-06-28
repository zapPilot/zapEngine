import { AsyncLocalStorage } from 'node:async_hooks';

interface StepLogContext {
  languageCode?: string;
}

const stepLogContext = new AsyncLocalStorage<StepLogContext>();

export async function withStepLogContext<T>(
  context: StepLogContext,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = stepLogContext.getStore() ?? {};
  return stepLogContext.run({ ...parent, ...context }, fn);
}

export async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  console.log(`[/ingest] step: ${name}${formatStepLogContext()}`);
  try {
    return await fn();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const wrapped = new Error(`[step:${name}] ${err.message}`, { cause: err });
    const meta = (err as { $metadata?: unknown }).$metadata;
    if (meta !== undefined) {
      (wrapped as { $metadata?: unknown }).$metadata = meta;
    }
    throw wrapped;
  }
}

export function logIngestSkip(reason: string): void {
  console.log(`[/ingest] skip: ${reason}${formatStepLogContext()}`);
}

function formatStepLogContext(): string {
  const context = stepLogContext.getStore();
  if (!context?.languageCode) {
    return '';
  }

  return ` language=${context.languageCode}`;
}
