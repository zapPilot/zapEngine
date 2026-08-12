import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  isPublisherReady,
  PROFILE_DIRECTORY,
  waitForPublisherReady,
  withRednotePublishPage,
} from './rednote-browser.js';

const LOGIN_TIMEOUT_MS = 300_000;

export async function runRednoteLogin(
  log: (message: string) => void = console.log,
): Promise<void> {
  await withRednotePublishPage(async (page) => {
    if (await isPublisherReady(page)) {
      log('✓ Rednote session is already logged in.');
      return;
    }

    log('A Chrome window is open on the Rednote creator page.');
    log('Log in there (the publisher never sees or stores your credentials).');
    log(`Waiting up to ${LOGIN_TIMEOUT_MS / 60_000} minutes...`);

    await waitForPublisherReady(page, LOGIN_TIMEOUT_MS);
    log(`✓ Logged in. Session saved to ${PROFILE_DIRECTORY}`);
  });
}

// jscpd:ignore-start — CLI direct-invocation check, same pattern as social/cli.ts
const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    await runRednoteLogin();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
// jscpd:ignore-end
