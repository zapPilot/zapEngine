import { createPlaywrightRednotePublisher } from './rednote-playwright.js';
import { createThreadsPublisher } from './threads.js';
import { prepareThreadsVideoUrl } from './threads-video.js';
import type {
  GeneratedSocialCopy,
  SocialPlatform,
  SocialPublishJob,
} from './types.js';
import { createPlaywrightXPublisher } from './x-playwright.js';

export async function createSocialPublishJobs(input: {
  platforms: readonly SocialPlatform[];
  copy: GeneratedSocialCopy;
  videoUrl: string;
  videoPath?: string;
  xVideoPath?: string;
  onLog?: (message: string) => void;
}): Promise<SocialPublishJob[]> {
  const jobs: SocialPublishJob[] = [];
  for (const platform of input.platforms) {
    switch (platform) {
      case 'x': {
        const videoPath = input.xVideoPath;
        if (!videoPath) {
          throw new Error('X publishing requires a prepared teaser video.');
        }
        const publisher = createPlaywrightXPublisher({ onLog: input.onLog });
        jobs.push({
          platform,
          publish: () =>
            publisher.publishX({
              text: input.copy.x.text,
              videoPath,
            }),
        });
        break;
      }
      case 'threads': {
        const publisher = createThreadsPublisher({
          onLog: input.onLog,
          prepareVideoUrl: (videoUrl) =>
            prepareThreadsVideoUrl(videoUrl, {
              ...(input.xVideoPath
                ? { preparedVideoPath: input.xVideoPath }
                : {}),
            }),
        });
        jobs.push({
          platform,
          publish: () =>
            publisher.publishThreads({
              text: input.copy.x.text,
              videoUrl: input.videoUrl,
            }),
        });
        break;
      }
      case 'rednote': {
        const videoPath = input.videoPath;
        if (!videoPath) {
          throw new Error('Rednote publishing requires a prepared video.');
        }
        const publisher = createPlaywrightRednotePublisher({
          onLog: input.onLog,
        });
        jobs.push({
          platform,
          publish: () =>
            publisher.publishRednote({
              title: input.copy.rednote.title,
              body: input.copy.rednote.body,
              hashtags: input.copy.rednote.hashtags,
              videoPath,
            }),
        });
        break;
      }
      default:
        assertNever(platform);
    }
  }

  return jobs;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported social platform: ${String(value)}`);
}
