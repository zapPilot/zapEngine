import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function isDirectInvocation(moduleUrl: string): boolean {
  const invokedPath = process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href
    : null;
  return invokedPath === moduleUrl;
}

export async function runWhenInvokedDirectly(
  moduleUrl: string,
  main: () => Promise<unknown>,
): Promise<void> {
  if (!isDirectInvocation(moduleUrl)) return;
  try {
    await main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
