import {
  completeSocialPublishJob,
  type SocialPublishJobRow,
} from './daemon-store.js';
import { getPublishedPlatform, readPublishState } from './state.js';

// Historical local publishers recorded successful transport without telemetry.
// Preserve that evidence as a completed job, never invent missing post content.
export async function reconcileLocalPublishedJob(
  job: SocialPublishJobRow,
  owner: string,
  log: (message: string) => void,
): Promise<boolean> {
  const language = job.language_code ?? 'zh-Hant';
  const existing = getPublishedPlatform(
    await readPublishState(),
    job.episode_id,
    job.platform,
    language,
  );
  if (!existing) return false;
  if (
    existing.published !== true ||
    !Number.isFinite(Date.parse(existing.publishedAt))
  ) {
    throw new Error(
      `Invalid local publication evidence for ${job.episode_id}/${job.platform}/${language}.`,
    );
  }
  await completeSocialPublishJob({
    jobId: job.id,
    owner,
    completedAt: new Date(existing.publishedAt),
    socialPostId: null,
  });
  log(
    `✅ [social-daemon] ${job.platform}/${language} · ${job.episode_id} · reconciled from local publication at ${existing.publishedAt}${existing.url ? ` · ${existing.url}` : ''} · historical telemetry unavailable`,
  );
  return true;
}
