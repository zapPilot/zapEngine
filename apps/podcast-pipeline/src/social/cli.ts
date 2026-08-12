import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import dotenv from 'dotenv';

import { generateSocialCopy, parseGeneratedSocialCopy } from './copy.js';
import { getSocialEpisode, parseSocialEpisodeId } from './episode.js';
import {
  assertOpenCliReady,
  createOpenCliBrowserPublisher,
} from './opencli.js';
import { publishSocialPlatforms } from './publish.js';
import { getPublishedPlatform, readPublishState } from './state.js';
import type {
  GeneratedSocialCopy,
  SocialEpisode,
  SocialLanguage,
  SocialPlatform,
  SocialPublishState,
} from './types.js';
import { type PreparedVideo, prepareSocialVideo } from './video.js';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
const USAGE =
  'Usage: pnpm social:publish <episode-uuid-or-share-url> [--dry-run] [--platform x|rednote] [--lang zh] [--force]';

dotenv.config({ path: resolve(REPO_ROOT, '.env') });

export interface SocialCliOptions {
  episodeId: string;
  dryRun: boolean;
  force: boolean;
  language: SocialLanguage;
  platform?: SocialPlatform;
}

interface ReviewSelection {
  copy: GeneratedSocialCopy;
  platforms: SocialPlatform[];
}

type ReviewAction =
  | { action: 'quit' }
  | { action: 'regenerate' }
  | { action: 'edit' }
  | { action: 'publish'; platforms: SocialPlatform[] };

export async function runSocialCli(args: string[]): Promise<void> {
  const options = parseCliOptions(args);
  const requestedPlatforms: SocialPlatform[] = options.platform
    ? [options.platform]
    : ['x', 'rednote'];
  let platforms = requestedPlatforms;

  if (!options.dryRun && !options.force) {
    const pendingPlatforms = await handleExistingState(
      options,
      requestedPlatforms,
    );
    if (!pendingPlatforms) return;
    platforms = pendingPlatforms;
  }

  const { episode, video } = await loadSocialAssets(options, platforms);

  console.log('Generating social copy...');
  const generated = await generateSocialCopy({ episode });
  console.log(`[ai] Generated copy using ${generated.model}`);

  if (options.dryRun) {
    printPreview(generated.copy, episode, video);
    console.log(
      '\nDry run complete. Browser was not opened and nothing was published.',
    );
    return;
  }

  const review = await reviewSocialCopy({
    episode,
    episodeId: options.episodeId,
    initialCopy: generated.copy,
    requestedPlatforms: platforms,
    video,
  });
  if (!review) return;

  if (
    review.platforms.includes('rednote') &&
    episode.videoDurationSeconds > 900
  ) {
    console.warn(
      `⚠ Rednote video is ${formatDuration(episode.videoDurationSeconds)}, above the platform's general 15-minute limit. Publishing will still be attempted.`,
    );
  }

  await assertOpenCliReady(review.platforms);
  const publisher = createOpenCliBrowserPublisher({
    onLog: (message) => console.log(message),
  });
  const outcomes = await publishSocialPlatforms({
    episodeId: options.episodeId,
    language: options.language,
    platforms: review.platforms,
    force: options.force,
    copy: review.copy,
    episodeUrl: episode.episodeUrl,
    ...(video ? { videoPath: video.path } : {}),
    publisher,
    onLog: (message) => console.log(message),
  });

  const failed = outcomes.filter((outcome) => outcome.status === 'failed');
  if (failed.length === 0) {
    console.log('Done.');
    return;
  }

  process.exitCode = 1;
  console.error(
    `Done with ${failed.length} failed platform${failed.length === 1 ? '' : 's'}. Successful platforms were saved and will be skipped next time.`,
  );
}

export function parseCliOptions(args: string[]): SocialCliOptions {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      lang: { type: 'string', default: 'zh' },
      platform: { type: 'string' },
    },
  });

  if (values.help) throw new Error(USAGE);
  if (positionals.length !== 1 || !positionals[0]?.trim()) {
    throw new Error(USAGE);
  }
  if (values.lang !== 'zh') {
    throw new Error(
      'MVP only supports --lang zh. No language fallback is allowed.',
    );
  }
  if (
    values.platform !== undefined &&
    values.platform !== 'x' &&
    values.platform !== 'rednote'
  ) {
    throw new Error('--platform must be x or rednote.');
  }

  return {
    episodeId: parseSocialEpisodeId(positionals[0]),
    dryRun: values['dry-run'],
    force: values.force,
    language: 'zh',
    ...(values.platform ? { platform: values.platform } : {}),
  };
}

async function loadSocialAssets(
  options: SocialCliOptions,
  requestedPlatforms: readonly SocialPlatform[],
): Promise<{
  episode: SocialEpisode;
  video?: PreparedVideo;
}> {
  console.log(`Fetching episode ${options.episodeId}...`);
  const episode = await getSocialEpisode(options.episodeId, options.language);
  console.log('✓ metadata');
  console.log('✓ transcript');

  if (!requestedPlatforms.includes('rednote')) return { episode };

  const videoUrl = episode.videos.zh;
  if (!videoUrl) {
    throw new Error(
      `No completed zh video found for episode ${options.episodeId}. Social publishing aborted.`,
    );
  }

  const video = await prepareSocialVideo({
    episodeId: options.episodeId,
    language: options.language,
    url: videoUrl,
  });
  console.log(
    `✓ zh video (${formatDuration(episode.videoDurationSeconds)}, ${formatBytes(video.sizeBytes)}${video.reused ? ', cached' : ''})`,
  );

  return { episode, video };
}

async function reviewSocialCopy(input: {
  episode: SocialEpisode;
  episodeId: string;
  initialCopy: GeneratedSocialCopy;
  requestedPlatforms: SocialPlatform[];
  video?: PreparedVideo;
}): Promise<ReviewSelection | null> {
  let copy = input.initialCopy;

  while (true) {
    printPreview(copy, input.episode, input.video);
    const review = await askReviewAction(input.requestedPlatforms);

    if (review.action === 'quit') return null;
    if (review.action === 'edit') {
      copy = await editCopy(input.episodeId, copy);
      continue;
    }
    if (review.action === 'regenerate') {
      const feedback = await promptLine('Feedback (optional): ');
      console.log('Regenerating social copy...');
      const regenerated = await generateSocialCopy({
        episode: input.episode,
        feedback,
      });
      copy = regenerated.copy;
      console.log(`[ai] Generated copy using ${regenerated.model}`);
      continue;
    }
    if (review.action === 'publish') {
      return { copy, platforms: review.platforms };
    }
  }
}

async function handleExistingState(
  options: SocialCliOptions,
  requestedPlatforms: SocialPlatform[],
): Promise<SocialPlatform[] | null> {
  const state = await readPublishState();
  const pending = findPendingPlatforms(
    state,
    options.episodeId,
    options.language,
    requestedPlatforms,
  );
  if (pending.length === requestedPlatforms.length) return requestedPlatforms;

  console.log(`⚠ Episode ${options.episodeId} was already published:`);
  for (const platform of requestedPlatforms) {
    const existing = getPublishedPlatform(
      state,
      options.episodeId,
      options.language,
      platform,
    );
    console.log(
      `${platform === 'x' ? 'X' : 'Rednote'}       ${existing ? '✓' : 'pending'}`,
    );
  }

  if (pending.length === 0) {
    console.log('Use --force to publish again.');
    return null;
  }

  const names = pending.map((platform) => (platform === 'x' ? 'X' : 'Rednote'));
  const answer = (await promptLine(`Retry ${names.join(' + ')}? [y/N] `))
    .trim()
    .toLowerCase();
  return answer === 'y' || answer === 'yes' ? pending : null;
}

export function findPendingPlatforms(
  state: SocialPublishState,
  episodeId: string,
  language: SocialLanguage,
  requestedPlatforms: readonly SocialPlatform[],
): SocialPlatform[] {
  return requestedPlatforms.filter(
    (platform) => !getPublishedPlatform(state, episodeId, language, platform),
  );
}

function printPreview(
  copy: GeneratedSocialCopy,
  episode: SocialEpisode,
  video?: PreparedVideo,
): void {
  const divider = '────────────────────────';
  console.log(`\n${divider}\nX\n${divider}`);
  console.log(`${copy.x.text}\n\n${episode.episodeUrl}`);
  console.log(`${divider}\nREDNOTE\n${divider}`);
  console.log('標題：');
  console.log(copy.rednote.title);
  console.log('正文：');
  console.log(copy.rednote.body);
  console.log(copy.rednote.hashtags.map((tag) => `#${tag}`).join(' '));
  const cacheSuffix = video?.reused ? ', cached' : '';
  console.log(
    video
      ? `🎬 video: ${formatDuration(episode.videoDurationSeconds)}, ${formatBytes(video.sizeBytes)}${cacheSuffix}\n${video.path}`
      : `🎬 video: ${formatDuration(episode.videoDurationSeconds)} (not downloaded for X-only publishing)`,
  );
  console.log(divider);
}

async function askReviewAction(
  requestedPlatforms: SocialPlatform[],
): Promise<ReviewAction> {
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

  const editor = process.env['EDITOR'] ?? 'vi';
  const result = spawnSync(editor, [path], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${editor} exited with status ${result.status}.`);
  }

  const raw = await readFile(path, 'utf8');
  try {
    return parseGeneratedSocialCopy(raw);
  } catch (error) {
    throw new Error(
      `Edited social copy is invalid: ${(error as Error).message}`,
      { cause: error },
    );
  }
}

async function promptLine(message: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Interactive review requires a TTY. Use --dry-run in non-interactive environments.',
    );
  }
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
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

function formatDuration(value: number): string {
  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toString().padStart(2, '0')}s`;
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
