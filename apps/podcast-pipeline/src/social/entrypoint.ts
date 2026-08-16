import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function runWhenDirectlyInvoked(
  metaUrl: string,
  handler: () => unknown,
): Promise<void> {
  const invokedPath = process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href
    : null;
  if (invokedPath !== metaUrl) return;
  try {
    await handler();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
