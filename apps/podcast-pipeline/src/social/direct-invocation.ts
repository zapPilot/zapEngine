import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function isInvokedDirectly(moduleUrl: string): boolean {
  const invokedPath = process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href
    : null;
  return invokedPath === moduleUrl;
}
