import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import dotenv from 'dotenv';

import { appendBrandCta } from '../brand/cta.js';
import { OUTRO_TAIL_MS } from '../services/video/manifest.js';
import { parsePlatformOption, requireEpisodeArgument } from './cli-args.js';
import { generateSocialCopy, parseGeneratedSocialCopy } from './copy.js';
import { getSocialEpisode } from './episode.js';
import {
  platformLabel,
  requiresLocalVideo,
  SOCIAL_PLATFORM_CONFIG,
  SOCIAL_PLATFORMS,
} from './platforms.js';
import {
  type PublishPlatformOutcome,
  publishSocialPlatforms,
} from './publish.js';
import { createSocialPublishJobs } from './publishers.js';
import { createSocialPostPersister } from './record.js';
import { getPublishedPlatform, readPublishState } from './state.js';
import type {
  GeneratedSocialCopy,
  SocialEpisode,
  SocialPlatform,
  SocialPublishState,
} from './types.js';
import {
  type PreparedVideo,
  prepareSocialVideo,
  prepareXTeaserVideo,
  X_TEASER_CONTENT_SECONDS,
  X_VIDEO_LIMIT_SECONDS,
} from './video.js';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
const PLATFORM_USAGE = SOCIAL_PLATFORMS.join('|');
const USAGE = `Usage: pnpm social:publish <episode-uuid-or-share-url> [--dry-run] [--platform ${PLATFORM_USAGE}] [--force]`;

dotenv.config({ path: resolve(REPO_ROOT, '.env') });

export interface SocialCliOptions {
  episodeId: string;
  dryRun: boolean;
  force: boolean;
  platform?: SocialPlatform;
}

interface SocialAssets {
  episode: SocialEpisode;
  video?: PreparedVideo;
  xVideo?: PreparedVideo;
}

interface ReviewSelection {
  copy: GeneratedSocialCopy;
  generatedCopy: GeneratedSocialCopy;
  model: string;
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
    : [...SOCIAL_PLATFORMS];
  let platforms = requestedPlatforms;

  if (!options.dryRun && !options.force) {
    const pendingPlatforms = await handleExistingState(
      options,
      requestedPlatforms,
    );
    if (!pendingPlatforms) return;
    platforms = pendingPlatforms;
  }

  const assets = await loadSocialAssets(options, platforms);
  const { episode, video, xVideo } = assets;

  console.log('Generating social copy...');
  const generated = await generateSocialCopy({ episode });
  console.log(`[ai] Generated copy using ${generated.model}`);

  if (options.dryRun) {
    printPreview(withBrandCta(generated.copy), assets);
    console.log(
      '\nDry run complete. Browser was not opened and nothing was published.',
    );
    return;
  }

  const review = await reviewSocialCopy({
    episode,
    episodeId: options.episodeId,
    initialCopy: generated.copy,
    initialModel: generated.model,
    requestedPlatforms: platforms,
    video,
    xVideo,
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

  const videoUrl = requireCanonicalVideoUrl(episode);
  const publishedCopy = withBrandCta(review.copy);
  const onLog = (message: string): void => console.log(message);
  const jobs = await createSocialPublishJobs({
    platforms: review.platforms,
    copy: publishedCopy,
    videoUrl,
    ...(video ? { videoPath: video.path } : {}),
    ...(xVideo ? { xVideoPath: xVideo.path } : {}),
    onLog,
  });
  const persistPublished = createSocialPostPersister({
    episodeId: options.episodeId,
    snapshot: {
      generated: review.generatedCopy,
      published: publishedCopy,
      model: review.model,
    },
    videoDurationSeconds: episode.videoDurationSeconds,
    onError: (message) => console.error(message),
  });
  const outcomes = await publishSocialPlatforms({
    episodeId: options.episodeId,
    jobs,
    force: options.force,
    persistPublished,
    onLog,
  });

  reportPublishOutcomes(outcomes);
}

function reportPublishOutcomes(
  outcomes: readonly PublishPlatformOutcome[],
): void {
  const failed = outcomes.filter((outcome) => outcome.status === 'failed');
  const stateFailures = outcomes.filter((outcome) => outcome.stateError);
  const recordFailures = outcomes.filter((outcome) => outcome.recordError);
  if (
    failed.length === 0 &&
    stateFailures.length === 0 &&
    recordFailures.length === 0
  ) {
    console.log('Done.');
    return;
  }

  process.exitCode = 1;
  if (failed.length > 0) {
    console.error(
      `Done with ${failed.length} failed platform${failed.length === 1 ? '' : 's'}. Successfully published platforms with saved local state will be skipped next time.`,
    );
  }
  if (stateFailures.length > 0) {
    const subject =
      stateFailures.length === 1 ? 'That post is' : 'Those posts are';
    const object = stateFailures.length === 1 ? 'it' : 'them';
    console.error(
      `Done with ${stateFailures.length} local duplicate-state failure${stateFailures.length === 1 ? '' : 's'}. ${subject} live, but ~/.zap-pilot/social-publisher.json was NOT saved for ${object}. Verify the platform post and repair the local state before rerunning, or the CLI may publish a duplicate.`,
    );
  }
  if (recordFailures.length > 0) {
    console.error(
      `Done with ${recordFailures.length} telemetry record failure${recordFailures.length === 1 ? '' : 's'}. The affected posts are live; use the payload above to restore each missing row.`,
    );
  }
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
      platform: { type: 'string' },
    },
  });

  const episodeId = requireEpisodeArgument(values.help, positionals, USAGE);
  return {
    episodeId,
    dryRun: values['dry-run'],
    force: values.force,
    ...(values.platform !== undefined
      ? { platform: parsePlatformOption(values.platform) }
      : {}),
  };
}

async function loadSocialAssets(
  options: SocialCliOptions,
  requestedPlatforms: readonly SocialPlatform[],
): Promise<SocialAssets> {
  console.log(`Fetching episode ${options.episodeId}...`);
  const episode = await getSocialEpisode(options.episodeId);
  console.log('✓ metadata');
  console.log('✓ transcript');

  if (!requiresLocalVideo(requestedPlatforms)) return { episode };

  const video = await prepareSocialVideo({
    episodeId: options.episodeId,
    url: requireCanonicalVideoUrl(episode),
  });
  console.log(
    `✓ zh video (${formatDuration(episode.videoDurationSeconds)}, ${formatBytes(video.sizeBytes)}${video.reused ? ', cached' : ''})`,
  );

  if (!requestedPlatforms.includes('x')) return { episode, video };

  const xVideo = await prepareXTeaserVideo({
    episodeId: options.episodeId,
    sourcePath: video.path,
    durationSeconds: episode.videoDurationSeconds,
  });
  console.log(
    `✓ X video (${formatDuration(xVideoDuration(episode.videoDurationSeconds))}, ${formatBytes(xVideo.sizeBytes)}${xVideo.reused ? ', cached/reused' : ''})`,
  );
  return { episode, video, xVideo };
}

async function reviewSocialCopy(input: {
  episode: SocialEpisode;
  episodeId: string;
  initialCopy: GeneratedSocialCopy;
  initialModel: string;
  requestedPlatforms: SocialPlatform[];
  video?: PreparedVideo;
  xVideo?: PreparedVideo;
}): Promise<ReviewSelection | null> {
  let copy = input.initialCopy;
  let generatedCopy = input.initialCopy;
  let model = input.initialModel;

  while (true) {
    printPreview(withBrandCta(copy), {
      episode: input.episode,
      video: input.video,
      xVideo: input.xVideo,
    });
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
      generatedCopy = regenerated.copy;
      model = regenerated.model;
      console.log(`[ai] Generated copy using ${regenerated.model}`);
      continue;
    }
    return { copy, generatedCopy, model, platforms: review.platforms };
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
    requestedPlatforms,
  );
  if (pending.length === requestedPlatforms.length) return requestedPlatforms;

  console.log(`⚠ Episode ${options.episodeId} was already published:`);
  for (const platform of requestedPlatforms) {
    const existing = getPublishedPlatform(state, options.episodeId, platform);
    console.log(
      `${platformLabel(platform)}       ${existing ? '✓' : 'pending'}`,
    );
  }

  if (pending.length === 0) {
    console.log('Use --force to publish again.');
    return null;
  }

  const names = pending.map(platformLabel);
  const answer = (await promptLine(`Retry ${names.join(' + ')}? [y/N] `))
    .trim()
    .toLowerCase();
  return answer === 'y' || answer === 'yes' ? pending : null;
}

export function findPendingPlatforms(
  state: SocialPublishState,
  episodeId: string,
  requestedPlatforms: readonly SocialPlatform[],
): SocialPlatform[] {
  return requestedPlatforms.filter(
    (platform) => !getPublishedPlatform(state, episodeId, platform),
  );
}

export function withBrandCta(copy: GeneratedSocialCopy): GeneratedSocialCopy {
  return {
    ...copy,
    x: { text: appendBrandCta(copy.x.text) },
    rednote: {
      ...copy.rednote,
      body: appendBrandCta(copy.rednote.body),
    },
  };
}

function printPreview(copy: GeneratedSocialCopy, assets: SocialAssets): void {
  const { episode, video, xVideo } = assets;
  const divider = '────────────────────────';
  console.log(`\nTaxonomy: ${copy.topic} / ${copy.hookType}`);
  console.log(`\n${divider}\nX\n${divider}`);
  console.log(copy.x.text);
  console.log(
    xVideo
      ? `🎬 teaser: ${formatDuration(xVideoDuration(episode.videoDurationSeconds))}, ${formatBytes(xVideo.sizeBytes)}\n${xVideo.path}`
      : '🎬 teaser: not prepared for this platform selection',
  );
  console.log(`${divider}\nTHREADS\n${divider}`);
  console.log(copy.x.text);
  console.log(`🎬 native video: ${requireCanonicalVideoUrl(episode)}`);
  console.log(`${divider}\nREDNOTE\n${divider}`);
  console.log('標題：');
  console.log(copy.rednote.title);
  console.log('正文：');
  console.log(copy.rednote.body);
  console.log(copy.rednote.hashtags.map((tag) => `#${tag}`).join(' '));
  console.log(
    video
      ? `🎬 video: ${formatDuration(episode.videoDurationSeconds)}, ${formatBytes(video.sizeBytes)}\n${video.path}`
      : `🎬 video: ${formatDuration(episode.videoDurationSeconds)} (remote only / not downloaded)`,
  );
  console.log(divider);
}

async function askReviewAction(
  requestedPlatforms: SocialPlatform[],
): Promise<ReviewAction> {
  const all = requestedPlatforms.length > 1;
  const options = [
    ...(all ? ['[a] Publish all'] : []),
    ...requestedPlatforms.map(
      (platform) =>
        `[${SOCIAL_PLATFORM_CONFIG[platform].reviewShortcut}] ${SOCIAL_PLATFORM_CONFIG[platform].label} only`,
    ),
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
      return { action: 'publish', platforms: requestedPlatforms };
    }
    const selected = requestedPlatforms.find(
      (platform) => SOCIAL_PLATFORM_CONFIG[platform].reviewShortcut === answer,
    );
    if (selected) return { action: 'publish', platforms: [selected] };
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

function requireCanonicalVideoUrl(episode: SocialEpisode): string {
  const videoUrl = episode.videos.zh?.trim();
  if (!videoUrl) {
    throw new Error(
      `No completed zh video found for episode ${episode.id}. Social publishing aborted.`,
    );
  }
  return videoUrl;
}

function xVideoDuration(fullDurationSeconds: number): number {
  if (fullDurationSeconds <= X_VIDEO_LIMIT_SECONDS) return fullDurationSeconds;
  return X_TEASER_CONTENT_SECONDS + OUTRO_TAIL_MS / 1_000;
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
