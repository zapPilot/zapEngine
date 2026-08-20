import { composeSocialContent, type SocialComposeEpisode } from './compose.js';
import { assertRednoteCopySafe } from './lexicon/index.js';
import { platformVideoMode } from './platforms.js';
import { createPlaywrightRednotePublisher } from './rednote-playwright.js';
import { createThreadsPublisher } from './threads.js';
import { prepareThreadsVideoUrl } from './threads-video.js';
import type {
  GeneratedSocialCopy,
  SocialPlatform,
  SocialPublishJob,
  YouTubePrivacyStatus,
} from './types.js';
import { createPlaywrightXPublisher } from './x-playwright.js';
import { createYouTubePublisher } from './youtube.js';

interface SocialPublishJobsInput {
  platforms: readonly SocialPlatform[];
  copy: GeneratedSocialCopy;
  episode: SocialComposeEpisode;
  videoUrl: string;
  videoPath?: string;
  xVideoPath?: string;
  /** Break-glass override for `social:publish`; the daemon always publishes public. */
  youtubePrivacyStatus?: YouTubePrivacyStatus;
  onLog?: (message: string) => void;
}

export async function createSocialPublishJobs(
  input: SocialPublishJobsInput,
): Promise<SocialPublishJob[]> {
  return input.platforms.map((platform) => createPlatformJob(platform, input));
}

function createPlatformJob(
  platform: SocialPlatform,
  input: SocialPublishJobsInput,
): SocialPublishJob {
  switch (platform) {
    case 'x':
      return createXJob(input);
    case 'threads':
      return createThreadsJob(input);
    case 'youtube':
      return createYouTubeJob(input);
    case 'rednote':
      return createRednoteJob(input);
    default:
      return assertNever(platform);
  }
}

function createXJob(input: SocialPublishJobsInput): SocialPublishJob {
  const platform = 'x';
  const videoPath = selectVideoPath(platform, input);
  if (!videoPath) {
    throw new Error(
      `X publishing requires a prepared ${platformVideoMode(platform)} video.`,
    );
  }
  const { body } = composeSocialContent(platform, input);
  const publisher = createPlaywrightXPublisher({ onLog: input.onLog });
  return {
    platform,
    publish: () => publisher.publishX({ text: body, videoPath }),
  };
}

function createThreadsJob(input: SocialPublishJobsInput): SocialPublishJob {
  const platform = 'threads';
  const { body } = composeSocialContent(platform, input);
  const publisher = createThreadsPublisher({
    onLog: input.onLog,
    ...(platformVideoMode(platform) === 'teaser'
      ? {
          prepareVideoUrl: (videoUrl: string) =>
            prepareThreadsVideoUrl(videoUrl, {
              ...(input.xVideoPath
                ? { preparedVideoPath: input.xVideoPath }
                : {}),
            }),
        }
      : {}),
  });
  return {
    platform,
    publish: () =>
      publisher.publishThreads({ text: body, videoUrl: input.videoUrl }),
  };
}

function createYouTubeJob(input: SocialPublishJobsInput): SocialPublishJob {
  const platform = 'youtube';
  const videoPath = selectVideoPath(platform, input);
  if (!videoPath) {
    throw new Error('YouTube publishing requires a prepared video.');
  }
  const { title, body } = composeSocialContent(platform, input);
  if (!title?.trim() || !body.trim()) {
    throw new Error(
      'YouTube publishing requires title and description metadata.',
    );
  }
  const publisher = createYouTubePublisher({ onLog: input.onLog });
  return {
    platform,
    publish: () =>
      publisher.publishYouTube({
        title,
        description: body,
        videoPath,
        privacyStatus: input.youtubePrivacyStatus ?? 'public',
      }),
  };
}

function createRednoteJob(input: SocialPublishJobsInput): SocialPublishJob {
  const platform = 'rednote';
  const videoPath = selectVideoPath(platform, input);
  if (!videoPath) {
    throw new Error('Rednote publishing requires a prepared video.');
  }
  const { title, body, hashtags } = composeSocialContent(platform, input);
  if (!title) {
    throw new Error('Rednote publishing requires a generated title.');
  }
  // The last mile: `copy.ts` gates each generated field, but only the composed
  // post is what Rednote review reads.
  assertRednoteCopySafe([title, body, ...hashtags].join('\n'));

  const publisher = createPlaywrightRednotePublisher({ onLog: input.onLog });
  return {
    platform,
    publish: () =>
      publisher.publishRednote({ title, body, hashtags, videoPath }),
  };
}

function selectVideoPath(
  platform: SocialPlatform,
  input: Pick<SocialPublishJobsInput, 'videoPath' | 'xVideoPath'>,
): string | undefined {
  return platformVideoMode(platform) === 'teaser'
    ? input.xVideoPath
    : input.videoPath;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported social platform: ${String(value)}`);
}
