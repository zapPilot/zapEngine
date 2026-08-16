import { applyPlatformCta, platformVideoMode } from './platforms.js';
import { createPlaywrightRednotePublisher } from './rednote-playwright.js';
import { createThreadsPublisher } from './threads.js';
import { prepareThreadsVideoUrl } from './threads-video.js';
import type {
  GeneratedSocialCopy,
  SocialPlatform,
  SocialPublishJob,
} from './types.js';
import { createPlaywrightXPublisher } from './x-playwright.js';
import { createYouTubePublisher } from './youtube.js';

interface SocialPublishJobsInput {
  platforms: readonly SocialPlatform[];
  copy: GeneratedSocialCopy;
  videoUrl: string;
  videoPath?: string;
  xVideoPath?: string;
  youtubeTitle?: string;
  youtubeDescription?: string;
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
  const publisher = createPlaywrightXPublisher({ onLog: input.onLog });
  return {
    platform,
    publish: () =>
      publisher.publishX({
        text: applyPlatformCta(platform, input.copy.x.text),
        videoPath,
      }),
  };
}

function createThreadsJob(input: SocialPublishJobsInput): SocialPublishJob {
  const platform = 'threads';
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
      publisher.publishThreads({
        text: applyPlatformCta(platform, input.copy.x.text),
        videoUrl: input.videoUrl,
      }),
  };
}

function createYouTubeJob(input: SocialPublishJobsInput): SocialPublishJob {
  const platform = 'youtube';
  const videoPath = selectVideoPath(platform, input);
  if (!videoPath) {
    throw new Error('YouTube publishing requires a prepared video.');
  }
  const title = input.youtubeTitle?.trim();
  const description = input.youtubeDescription?.trim();
  if (!title || !description) {
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
        description,
        videoPath,
        privacyStatus: 'public',
      }),
  };
}

function createRednoteJob(input: SocialPublishJobsInput): SocialPublishJob {
  const platform = 'rednote';
  const videoPath = selectVideoPath(platform, input);
  if (!videoPath) {
    throw new Error('Rednote publishing requires a prepared video.');
  }
  const publisher = createPlaywrightRednotePublisher({ onLog: input.onLog });
  return {
    platform,
    publish: () =>
      publisher.publishRednote({
        title: input.copy.rednote.title,
        body: applyPlatformCta(platform, input.copy.rednote.body),
        hashtags: input.copy.rednote.hashtags,
        videoPath,
      }),
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
