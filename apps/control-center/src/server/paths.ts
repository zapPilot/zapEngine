import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);

let envLoaded = false;

export function loadEnv(): void {
  if (envLoaded) {
    return;
  }
  dotenv.config({ path: resolve(repoRoot, '.env') });
  envLoaded = true;
}

export function getRepoRoot(): string {
  return repoRoot;
}
