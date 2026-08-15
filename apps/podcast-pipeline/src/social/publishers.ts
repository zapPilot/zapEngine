import { assertXSessionReady, createOpenCliXPublisher } from './opencli.js';
import { createPlaywrightRednotePublisher } from './rednote-playwright.js';
import { createThreadsPublisher } from './threads.js';
import type {
  GeneratedSocialCopy,
  SocialPlatform,
  SocialPublishJob,
} from './types.js';

export async function createSocialPublishJobs(input: {
  platforms: readonly SocialPlatform[];
  copy: GeneratedSocialCopy;
  episodeUrl: string;
  videoPath?: string;
  onLog?: (message: string) => void;
}): Promise<SocialPublishJob[]> {
  const jobs: SocialPublishJob[] = [];
  for (const platform of input.platforms) {
    switch (platform) {
      case 'x': {
        const publisher = createOpenCliXPublisher({ onLog: input.onLog });
        jobs.push({
          platform,
          publish: async () => {
            await assertXSessionReady();
            return publisher.publishX({
              text: input.copy.x.text,
              episodeUrl: input.episodeUrl,
            });
          },
        });
        break;
      }
      case 'threads': {
        const publisher = createThreadsPublisher({ onLog: input.onLog });
        jobs.push({
          platform,
          publish: () =>
            publisher.publishThreads({
              text: input.copy.x.text,
              episodeUrl: input.episodeUrl,
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
