import { shell } from 'electron';

import { isHttpsUrl } from '../shared/ipc';

/**
 * OAuth and outbound links leave the shell: https URLs open in the system
 * browser (Privy OAuth round-trips back via the zappilotv2:// deep link).
 * Everything else is refused.
 */
export async function openExternalUrl(url: unknown): Promise<boolean> {
  if (!isHttpsUrl(url)) {
    return false;
  }
  await shell.openExternal(url);
  return true;
}
