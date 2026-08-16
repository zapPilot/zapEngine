import { runWhenInvokedDirectly } from '../lib/direct-invocation.js';
import {
  isPublisherReady,
  PROFILE_DIRECTORY,
  waitForPublisherReady,
  withRednotePublishPage,
} from './rednote-browser.js';

const LOGIN_TIMEOUT_MS = 300_000;
const SESSION_CHECK_TIMEOUT_MS = 8_000;

export async function isRednoteSessionReady(): Promise<boolean> {
  return withRednotePublishPage(
    (page) => isPublisherReady(page, SESSION_CHECK_TIMEOUT_MS),
    { headless: true },
  );
}

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

await runWhenInvokedDirectly(import.meta.url, () => runRednoteLogin());
