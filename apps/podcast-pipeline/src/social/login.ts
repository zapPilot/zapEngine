import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { runWhenInvokedDirectly } from '../lib/direct-invocation.js';
import { isRednoteSessionReady, runRednoteLogin } from './rednote-login.js';
import {
  ensureThreadsSession,
  THREADS_INSIGHTS_SCOPE,
} from './threads-auth.js';
import { isXSessionReady, runXLogin } from './x-playwright.js';
import {
  ensureYouTubeSession,
  YOUTUBE_ANALYTICS_SCOPE,
} from './youtube-auth.js';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);

dotenv.config({ path: resolve(REPO_ROOT, '.env') });

export async function runSocialLogin(
  log: (message: string) => void = console.log,
): Promise<void> {
  const failures: string[] = [];

  log('Checking social sessions...');

  if (await isXSessionReady()) {
    log('✓ X');
  } else {
    log('• X is not logged in. Opening Chrome...');
    try {
      await runXLogin(log);
      if (!(await isXSessionReady())) {
        throw new Error(
          'X login finished but the publisher is still not authenticated.',
        );
      }
      log('✓ X');
    } catch (error) {
      failures.push('X');
      log(`✗ X: ${errorMessage(error)}`);
    }
  }

  try {
    const { profile } = await ensureThreadsSession({
      additionalScopes: [THREADS_INSIGHTS_SCOPE],
    });
    log(`✓ Threads @${profile.username}`);
  } catch (error) {
    failures.push('Threads');
    log(`✗ Threads: ${errorMessage(error)}`);
  }

  try {
    await ensureYouTubeSession({
      additionalScopes: [YOUTUBE_ANALYTICS_SCOPE],
    });
    log('✓ YouTube');
  } catch (error) {
    failures.push('YouTube');
    log(`✗ YouTube: ${errorMessage(error)}`);
  }

  try {
    if (await isRednoteSessionReady()) {
      log('✓ Rednote');
    } else {
      log('• Rednote is not logged in. Opening Chrome...');
      await runRednoteLogin(log);
    }
  } catch (error) {
    failures.push('Rednote');
    log(`✗ Rednote: ${errorMessage(error)}`);
  }

  if (failures.length > 0) {
    throw new Error(`Social login incomplete: ${failures.join(', ')}.`);
  }

  log('All social platforms are ready.');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

await runWhenInvokedDirectly(import.meta.url, () => runSocialLogin());
