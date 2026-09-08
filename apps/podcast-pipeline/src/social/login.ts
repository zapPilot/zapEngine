import { runCli } from '../lib/cli-runner.js';
import { errorMessage } from '../lib/errorMessage.js';
import { isMainModule } from '../lib/is-main-module.js';
import { isRednoteSessionReady, runRednoteLogin } from './rednote-login.js';
import {
  ensureThreadsSession,
  THREADS_INSIGHTS_SCOPE,
} from './threads-auth.js';
import { isXSessionReady, runXLogin } from './x-playwright.js';
import { assertYouTubeChannel } from './youtube.js';
import {
  ensureYouTubeSession,
  YOUTUBE_ANALYTICS_SCOPE,
  YOUTUBE_READONLY_SCOPE,
} from './youtube-auth.js';

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
    const session = await ensureYouTubeSession({
      additionalScopes: [YOUTUBE_ANALYTICS_SCOPE, YOUTUBE_READONLY_SCOPE],
    });
    const channelId = await assertYouTubeChannel({
      accessToken: session.accessToken,
    });
    log(`✓ YouTube ${channelId}`);
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

if (isMainModule(import.meta.url)) {
  runCli(() => runSocialLogin());
}
