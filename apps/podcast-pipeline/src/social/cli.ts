import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import dotenv from 'dotenv';

import { errorMessage } from '../lib/errorMessage.js';
import {
  parsePlatformOption,
  parseYouTubePrivacyOption,
  requireEpisodeArgument,
} from './cli-args.js';
import { composeSocialContent } from './compose.js';
import { generateSocialCopy, parseGeneratedSocialCopy } from './copy.js';
import { getSocialEpisode, requireSocialEpisodeVideoUrl } from './episode.js';
import { isMainModule } from './is-main-module.js';
import {
  platformLabel,
  requiresLocalTeaser,
  requiresLocalVideo,
  SOCIAL_PLATFORM_CONFIG,
  SOCIAL_PLATFORMS,
} from './platforms.js';
import type { PublishPlatformOutcome } from './publish.js';
import { publishSocialBatch } from './publish-batch.js';
import { getPublishedPlatform, readPublishState } from './state.js';
import type {
  GeneratedSocialCopy,
  SocialEpisode,
  SocialLanguageCode,
  SocialPlatform,
  SocialPublishState,
  YouTubePrivacyStatus,
} from './types.js';
import {
  type PreparedVideo,
  prepareSocialVideo,
  prepareXTeaserVideo,
  xTeaserDurationSeconds,
} from './video.js';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
const PLATFORM_USAGE = SOCIAL_PLATFORMS.join('|');
const USAGE = `Usage: pnpm social:publish <episode-uuid-or-share-url> --language zh-Hant|ja|en [--dry-run] [--yes] [--platform ${PLATFORM_USAGE}] [--youtube-privacy private|unlisted|public] [--force]`;

dotenv.config({ path: resolve(REPO_ROOT, '.env') });

export interface SocialCliOptions {
  episodeId: string;
  languageCode: SocialLanguageCode;
  dryRun: boolean;
  force: boolean;
  yes: boolean;
  platform?: SocialPlatform;
  platforms?: SocialPlatform[];
  youtubePrivacy?: YouTubePrivacyStatus;
}

interface SocialAssets {
  episode: SocialEpisode;
  video?: PreparedVideo;
  xVideo?: PreparedVideo;
}

/**
 * `social:publish` is break-glass, so an operator smoke-testing a new upload path
 * can hold one video back from the audience. Every unattended path — the daemon
 * included — leaves this unset and publishes public.
 */
type PrivacyOverride = YouTubePrivacyStatus | undefined;

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

export async function runSocialCli(
  args: string[],
  runtime: {
    strategyGuidance?: string;
    strategyGuidanceByPlatform?: Partial<Record<SocialPlatform, string>>;
    setExitCodeOnFailure?: boolean;
  } = {},
): Promise<PublishPlatformOutcome[]> {
  const options = parseCliOptions(args);
  const requestedPlatforms: SocialPlatform[] =
    options.platforms ??
    (options.platform ? [options.platform] : [...SOCIAL_PLATFORMS]);
  let platforms = requestedPlatforms;

  if (!options.dryRun && !options.force) {
    const pendingPlatforms = await handleExistingState(
      options,
      requestedPlatforms,
    );
    if (!pendingPlatforms) return [];
    platforms = pendingPlatforms;
  }

  const assets = await loadSocialAssets(options, platforms);
  const { episode, video, xVideo } = assets;

  console.log('Generating social copy...');
  const generated = await generateSocialCopy({
    episode,
    languageCode: options.languageCode,
    platforms,
    ...(runtime.strategyGuidance
      ? { strategyGuidance: runtime.strategyGuidance }
      : {}),
    ...(runtime.strategyGuidanceByPlatform
      ? { strategyGuidanceByPlatform: runtime.strategyGuidanceByPlatform }
      : {}),
  });
  console.log(`[ai] Generated copy using ${generated.model}`);

  if (options.dryRun) {
    printPreview(generated.copy, assets, options.youtubePrivacy);
    console.log(
      '\nDry run complete. Browser was not opened and nothing was published.',
    );
    return [];
  }

  const review = options.yes
    ? autoApproveSocialCopy({
        copy: generated.copy,
        model: generated.model,
        platforms,
        assets,
        youtubePrivacy: options.youtubePrivacy,
      })
    : await reviewSocialCopy({
        episode,
        episodeId: options.episodeId,
        initialCopy: generated.copy,
        initialModel: generated.model,
        requestedPlatforms: platforms,
        video,
        xVideo,
        youtubePrivacy: options.youtubePrivacy,
      });
  if (!review) return [];

  if (
    review.platforms.includes('rednote') &&
    episode.videoDurationSeconds > 900
  ) {
    console.warn(
      `⚠ Rednote video is ${formatDuration(episode.videoDurationSeconds)}, above the platform's general 15-minute limit. Publishing will still be attempted.`,
    );
  }

  const publishedCopy = review.copy;
  const onLog = (message: string): void => console.log(message);
  const outcomes = await publishSocialBatch({
    episodeId: options.episodeId,
    languageCode: options.languageCode,
    platforms: review.platforms.map((platform) => ({ platform })),
    copySnapshot: {
      generated: review.generatedCopy,
      published: publishedCopy,
      model: review.model,
    },
    episode,
    ...(video ? { video } : {}),
    ...(xVideo ? { teaserVideo: xVideo } : {}),
    force: options.force,
    ...(options.youtubePrivacy
      ? { youtubePrivacyStatus: options.youtubePrivacy }
      : {}),
    onLog,
  });

  reportPublishOutcomes(outcomes, runtime.setExitCodeOnFailure ?? true);
  return outcomes;
}

function reportPublishOutcomes(
  outcomes: readonly PublishPlatformOutcome[],
  setExitCodeOnFailure: boolean,
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

  if (setExitCodeOnFailure) process.exitCode = 1;
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
      yes: { type: 'boolean', short: 'y', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      platform: { type: 'string' },
      language: { type: 'string' },
      'youtube-privacy': { type: 'string' },
    },
  });

  const episodeId = requireEpisodeArgument(values.help, positionals, USAGE);
  if (!values.language) {
    throw new Error(`--language is required.\n${USAGE}`);
  }
  return {
    episodeId,
    languageCode: parseSocialLanguage(values.language),
    dryRun: values['dry-run'],
    force: values.force,
    yes: values.yes,
    ...(values.platform !== undefined
      ? parsePlatformSelection(values.platform)
      : {}),
    ...(values['youtube-privacy'] !== undefined
      ? {
          youtubePrivacy: parseYouTubePrivacyOption(values['youtube-privacy']),
        }
      : {}),
  };
}

function parsePlatformSelection(
  value: string,
): Pick<SocialCliOptions, 'platform' | 'platforms'> {
  const platforms = value
    .split(',')
    .map((platform) => parsePlatformOption(platform.trim()));
  return platforms.length === 1
    ? { platform: platforms[0] }
    : { platforms: [...new Set(platforms)] };
}

async function loadSocialAssets(
  options: SocialCliOptions,
  requestedPlatforms: readonly SocialPlatform[],
): Promise<SocialAssets> {
  console.log(`Fetching episode ${options.episodeId}...`);
  const episode = await getSocialEpisode(
    options.episodeId,
    options.languageCode,
  );
  console.log('✓ metadata');
  console.log('✓ transcript');

  if (!requiresLocalVideo(requestedPlatforms)) return { episode };

  const video = await prepareSocialVideo({
    episodeId: options.episodeId,
    languageCode: options.languageCode,
    url: requireSocialEpisodeVideoUrl(episode),
  });
  console.log(
    `✓ ${options.languageCode} video (${formatDuration(episode.videoDurationSeconds)}, ${formatBytes(video.sizeBytes)}${video.reused ? ', cached' : ''})`,
  );

  if (!requiresLocalTeaser(requestedPlatforms)) return { episode, video };

  const xVideo = await prepareXTeaserVideo({
    episodeId: options.episodeId,
    sourcePath: video.path,
    durationSeconds: episode.videoDurationSeconds,
  });
  console.log(
    `✓ X video (${formatDuration(xTeaserDurationSeconds(episode.videoDurationSeconds))}, ${formatBytes(xVideo.sizeBytes)}${xVideo.reused ? ', cached/reused' : ''})`,
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
  youtubePrivacy: PrivacyOverride;
}): Promise<ReviewSelection | null> {
  let copy = input.initialCopy;
  let generatedCopy = input.initialCopy;
  let model = input.initialModel;

  while (true) {
    printPreview(
      copy,
      { episode: input.episode, video: input.video, xVideo: input.xVideo },
      input.youtubePrivacy,
    );
    const review = await askReviewAction(input.requestedPlatforms);

    if (review.action === 'quit') return null;
    if (review.action === 'edit') {
      copy = await editCopy(input.episodeId, copy, input.episode.languageCode);
      continue;
    }
    if (review.action === 'regenerate') {
      const feedback = await promptLine('Feedback (optional): ');
      console.log('Regenerating social copy...');
      const regenerated = await generateSocialCopy({
        episode: input.episode,
        languageCode: input.episode.languageCode,
        platforms: input.requestedPlatforms,
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
    options.languageCode,
  );
  if (pending.length === requestedPlatforms.length) return requestedPlatforms;

  console.log(`⚠ Episode ${options.episodeId} was already published:`);
  for (const platform of requestedPlatforms) {
    const existing = getPublishedPlatform(
      state,
      options.episodeId,
      platform,
      options.languageCode,
    );
    console.log(
      `${platformLabel(platform)}       ${existing ? '✓' : 'pending'}`,
    );
  }

  if (pending.length === 0) {
    console.log('Use --force to publish again.');
    return null;
  }

  const names = pending.map(platformLabel);
  if (options.yes) {
    console.log(`Retrying pending platforms: ${names.join(' + ')}`);
    return pending;
  }

  const answer = (await promptLine(`Retry ${names.join(' + ')}? [y/N] `))
    .trim()
    .toLowerCase();
  return answer === 'y' || answer === 'yes' ? pending : null;
}

function autoApproveSocialCopy(input: {
  copy: GeneratedSocialCopy;
  model: string;
  platforms: SocialPlatform[];
  assets: SocialAssets;
  youtubePrivacy: PrivacyOverride;
}): ReviewSelection {
  printPreview(input.copy, input.assets, input.youtubePrivacy);
  console.log(
    `Auto-approved ${input.platforms.map(platformLabel).join(' + ')} with --yes.`,
  );
  return {
    copy: input.copy,
    generatedCopy: input.copy,
    model: input.model,
    platforms: input.platforms,
  };
}

export function findPendingPlatforms(
  state: SocialPublishState,
  episodeId: string,
  requestedPlatforms: readonly SocialPlatform[],
  languageCode: SocialLanguageCode = 'zh-Hant',
): SocialPlatform[] {
  return requestedPlatforms.filter(
    (platform) =>
      !getPublishedPlatform(state, episodeId, platform, languageCode),
  );
}

function printPreview(
  copy: GeneratedSocialCopy,
  assets: SocialAssets,
  youtubePrivacy: PrivacyOverride,
): void {
  const { episode, video, xVideo } = assets;
  const divider = '────────────────────────';
  // Previewed through the same composition the publisher uses, so review can
  // never show wording a platform will not receive.
  const compose = (platform: SocialPlatform) =>
    composeSocialContent(platform, { copy, episode });
  console.log(`\nTaxonomy: ${copy.topic} / ${copy.hookType}`);
  console.log(`\n${divider}\nX\n${divider}`);
  console.log(compose('x').body);
  console.log(
    xVideo
      ? `🎬 teaser: ${formatDuration(xTeaserDurationSeconds(episode.videoDurationSeconds))}, ${formatBytes(xVideo.sizeBytes)}\n${xVideo.path}`
      : '🎬 teaser: not prepared for this platform selection',
  );
  console.log(`${divider}\nTHREADS\n${divider}`);
  console.log(compose('threads').body);
  console.log(`🎬 native video: ${episode.videoUrl}`);
  console.log(`${divider}\nYOUTUBE\n${divider}`);
  const youtube = compose('youtube');
  console.log(youtube.title);
  console.log(youtube.body);
  if (youtubePrivacy) console.log(`🔒 privacy override: ${youtubePrivacy}`);
  console.log(formatVideoPreview(video, episode.videoDurationSeconds));
  console.log(`${divider}\nREDNOTE\n${divider}`);
  const rednote = compose('rednote');
  console.log(`標題：${rednote.title ?? ''}`);
  console.log('描述：');
  console.log(rednote.body);
  console.log(rednote.hashtags.map((tag) => `#${tag}`).join(' '));
  console.log(formatVideoPreview(video, episode.videoDurationSeconds));
  console.log(divider);
}

function formatVideoPreview(
  video: PreparedVideo | undefined,
  durationSeconds: number,
): string {
  return video
    ? `🎬 video: ${formatDuration(durationSeconds)}, ${formatBytes(video.sizeBytes)}\n${video.path}`
    : `🎬 video: ${formatDuration(durationSeconds)} (remote only / not downloaded)`;
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
  languageCode: SocialLanguageCode,
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
    return parseGeneratedSocialCopy(raw, languageCode, {
      short: copy.short !== undefined,
      rednote: copy.rednote !== undefined,
    });
  } catch (error) {
    throw new Error(
      `Edited social copy is invalid: ${(error as Error).message}`,
      { cause: error },
    );
  }
}

function parseSocialLanguage(value: string): SocialLanguageCode {
  if (value === 'zh-Hant' || value === 'ja' || value === 'en') return value;
  throw new Error(`Unsupported social language: ${value}.`);
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

if (isMainModule(import.meta.url)) {
  try {
    await runSocialCli(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}
