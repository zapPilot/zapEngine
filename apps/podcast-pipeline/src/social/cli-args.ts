import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseSocialEpisodeId } from './episode.js';
import { isSocialPlatform, SOCIAL_PLATFORMS } from './platforms.js';
import type { SocialPlatform } from './types.js';

/**
 * True when the running script is the one named on the command line, so CLI
 * entry points can run their top-level flow only when invoked directly and
 * stay inert when imported by a test or another module. Callers pass their own
 * `import.meta.url`, since `import.meta` inside this helper is this module's.
 */
export function isInvokedDirectly(moduleUrl: string): boolean {
  const invokedPath = process.argv[1]
    ? pathToFileURL(resolve(process.argv[1])).href
    : null;
  return invokedPath === moduleUrl;
}

export async function runInvokedCli(
  moduleUrl: string,
  run: () => Promise<unknown>,
): Promise<void> {
  if (!isInvokedDirectly(moduleUrl)) return;
  try {
    await run();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

/**
 * The argument contract every social command shares, so the publisher and the
 * metrics recorder cannot drift into accepting different episode references or
 * reporting a different platform vocabulary. `--help` and a malformed episode
 * reference both raise the caller's own usage line.
 */
export function requireEpisodeArgument(
  help: boolean,
  positionals: string[],
  usage: string,
): string {
  const [episode] = positionals;
  if (help || positionals.length !== 1 || !episode?.trim()) {
    throw new Error(usage);
  }
  return parseSocialEpisodeId(episode);
}

export function parsePlatformOption(value: string): SocialPlatform {
  if (!isSocialPlatform(value)) {
    throw new Error(
      `--platform must be one of: ${SOCIAL_PLATFORMS.join(', ')}.`,
    );
  }
  return value;
}
