import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import dotenv from 'dotenv';

import { generateSocialCopy, parseGeneratedSocialCopy } from './copy.js';
import { getSocialEpisode } from './episode.js';
import { assertOpenCliReady, createOpenCliBrowserPublisher } from './opencli.js';
import { publishSocialPlatforms } from './publish.js';
import { getPublishedPlatform, readPublishState } from './state.js';
import type {
  GeneratedSocialCopy,
  SocialLanguage,
  SocialPlatform,
} from './types.js';
import { prepareSocialVideo } from './video.js';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
dotenv.config({ path: resolve(REPO_ROOT, '.env') });

export interface SocialCliOptions {
  episodeId: string;
  dryRun: boolean;
  force: boolean;
  language: SocialLanguage;
  platform?: SocialPlatform;
}

type ReviewAction = 'publish' | 'regenerate' | 'edit' | 'quit';

export async function runSocialCli(args: string[]): Promise<void> {
  const options = parseCliOptions(args);
  const requestedPlatforms: SocialPlatform[] = options.platform
    ? [options.platform]
    : ['x', 'rednote'];

  if (!options.dryRun && !options.force) {
    const shouldContinue = await handleExistingState(options, requestedPlatforms);
    if (!shouldContinue) return;
  }

  console.log(`Fetching episode ${options.episodeId}...`);
  const episode = await getSocialEpisode(options.episodeId, options.language);
  console.log('✓ metadata');
  console.log('✓ transcript');
  const videoUrl = episode.videos.zh;
  if (!videoUrl) {
    throw new Error(
      `No completed zh video found for episode ${options.episodeId}. Social publishing aborted.`,
    );
  }

  const preparedVideo = await prepareSocialVideo({
    episodeId: options.episodeId,
    language: options.language,
    url: videoUrl,
  });
  console.log(
    `✓ zh video (${formatBytes(preparedVideo.sizeBytes)}${preparedVideo.reused ? ', cached' : ''})`,
  );

  console.log('Generating social copy...');
  let generated = await generateSocialCopy({ episode });
  let copy = generated.copy;
  console.log(`[ai] Generated copy using ${generated.model}`);

  if (options.dryRun) {
    printPreview(copy, preparedVideo.path);
    console.log('\nDry run complete. Browser was not opened and nothing was published.');
    return;
  }

  while (true) {
    printPreview(copy, preparedVideo.path);
    const review = await askReviewAction(requestedPlatforms);
    if (review.action === 'quit') return;
    if (review.action === 'regenerate') {
      const feedback = await promptLine('Feedback (optional): ');
      console.log('Regenerating social copy...');
      generated = await generateSocialCopy({ episode, feedback });
      copy = generated.copy;
      console.log(`[ai] Generated copy using ${generated.model}`);
      continue;
    }
    if (review.action === 'edit') {
      copy = await editCopy(options.episodeId, copy);
      continue;
    }

    await assertOpenCliReady();
    const publisher = createOpenCliBrowserPublisher({
      onLog: (message) => console.log(message),
    });
    const outcomes = await publishSocialPlatforms({
      episodeId: options.episodeId,
      language: options.language,
      platforms: review.platforms,
      force: options.force,
      copy,
      videoPath: preparedVideo.path,
      publisher,
      onLog: (message) => console.log(message),
    });

    const failed = outcomes.filter((outcome) => outcome.status === 'failed');
    if (failed.length > 0) {
      process.exitCode = 1;
      console.error(
        `Done with ${failed.length} failed platform${failed.length === 1 ? '' : 's'}. Successful platforms were saved and will be skipped next time.`,
      );
    } else {
      console.log('Done.');
    }
    return;
  }
}

export function parseCliOptions(args: string[]): SocialCliOptions {
  let episodeId: string | undefined;
  let dryRun = false;
  let force = false;
  let language: SocialLanguage = 'zh';
  let platform: SocialPlatform | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--lang') {
      const value = args[index + 1];
      index += 1;
      if (value !== 'zh') {
        throw new Error('MVP only supports --lang zh. No language fallback is allowed.');
      }
      language = value;
      continue;
    }
    if (arg === '--platform') {
      const value = args[index + 1];
      index += 1;
      if (value !== 'x' && value !== 'rednote') {
        throw new Error('--platform must be x or rednote.');
      }
      platform = value;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      throw new Error('Usage: pnpm social:publish <episode-id> [--dry-run] [--platform x|rednote] [--lang zh] [--force]');
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (episodeId) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    episodeId = arg;
  }

  if (!episodeId?.trim()) {
    throw new Error('Usage: pnpm social:publish <episode-id> [options]');
  }

  return { episodeId: episodeId.trim(), dryRun, force, language, platform };
}

async function handleExistingState(
  options: SocialCliOptions,
  requestedPlatforms: SocialPlatform[],
): Promise<boolean> {
  const state = await readPublishState();
  const published = requestedPlatforms.filter((platform) =>
    getPublishedPlatform(state, options.episodeId, options.language, platform),
  );
  if (published.length === 0) return true;

  console.log(`⚠ Episode ${options.episodeId} was already published:`);
  for (const platform of requestedPlatforms) {
    const existing = getPublishedPlatform(
      state,
      options.episodeId,
      options.language,
      platform,
    );
    console.log(`${platform === 'x' ? 'X' : 'Rednote'}       ${existing ? '✓' : 'pending'}`);
  }

  if (published.length === requestedPlatforms.length) {
    console.log('Use --force to publish again.');
    return false;
  }

  const pending = requestedPlatforms.filter(
    (platform) => !published.includes(platform),
  );
  const names = pending.map((platform) => (platform === 'x' ? 'X' : 'Rednote'));
  const answer = (await promptLine(`Retry ${names.join(' + ')}? [y/N] `))
    .trim()
    .toLowerCase();
  return answer === 'y' || answer === 'yes';
}

function printPreview(copy: GeneratedSocialCopy, videoPath: string): void {
  const divider = '────────────────────────';
  console.log(`\n${divider}\nX\n${divider}`);
  console.log(copy.x.text);
  console.log(`🎬 video: ${videoPath}`);
  console.log(`${divider}\nREDNOTE\n${divider}`);
  console.log('標題：');
  console.log(copy.rednote.title);
  console.log('正文：');
  console.log(copy.rednote.body);
  console.log(copy.rednote.hashtags.map((tag) => `#${tag}`).join(' '));
  console.log(divider);
}

async function askReviewAction(
  requestedPlatforms: SocialPlatform[],
): Promise<
  | { action: Exclude<ReviewAction, 'publish'> }
  | { action: 'publish'; platforms: SocialPlatform[] }
> {
  const all = requestedPlatforms.length === 2;
  const options = [
    ...(all ? ['[a] Publish all'] : []),
    ...(requestedPlatforms.includes('x') ? ['[x] X only'] : []),
    ...(requestedPlatforms.includes('rednote') ? ['[r] Rednote only'] : []),
    '[g] Regenerate',
    '[e] Edit',
    '[q] Quit',
  ];
  console.log(options.join('  '));

  while (true) {
    const answer = (await promptLine('> ')).trim().toLowerCase();
    if (answer === 'q') return { action: 'quit' };
    if (answer === 'g') return { action: 'regenerate' };
    if (answer === 'e') return { action: 'edit' };
    if (answer === 'a' && all) {
      return { action: 'publish', platforms: ['x', 'rednote'] };
    }
    if (answer === 'x' && requestedPlatforms.includes('x')) {
      return { action: 'publish', platforms: ['x'] };
    }
    if (answer === 'r' && requestedPlatforms.includes('rednote')) {
      return { action: 'publish', platforms: ['rednote'] };
    }
    console.log('Unknown choice.');
  }
}

async function editCopy(
  episodeId: string,
  copy: GeneratedSocialCopy,
): Promise<GeneratedSocialCopy> {
  const directory = join(tmpdir(), 'zap-pilot-social');
  await mkdir(directory, { recursive: true });
  const safeEpisodeId = episodeId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = join(directory, `episode-${safeEpisodeId}-copy.json`);
  await writeFile(path, `${JSON.stringify(copy, null, 2)}\n`, 'utf8');

  const editor = process.env['EDITOR']?.trim() || 'vi';
  const result = spawnSync(editor, [path], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${editor} exited with status ${result.status}.`);
  }

  const raw = await readFile(path, 'utf8');
  try {
    return parseGeneratedSocialCopy(raw);
  } catch (error) {
    throw new Error(`Edited social copy is invalid: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

async function promptLine(message: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Interactive review requires a TTY. Use --dry-run in non-interactive environments.');
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readline.question(message);
  } finally {
    readline.close();
  }
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    await runSocialCli(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
