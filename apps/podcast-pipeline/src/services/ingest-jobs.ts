import type { LanguageClassroomLanguageCode } from '../types.js';
import { getPipelineSupabase, throwSupabaseError } from './supabase-client.js';
import type { TelegramChatId } from './telegram.js';

export type PodcastIngestJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface PodcastIngestJobRow {
  id: string;
  source_url: string;
  language_code: LanguageClassroomLanguageCode;
  telegram_chat_id: string;
  status: PodcastIngestJobStatus;
  attempt_count: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
}

export interface PodcastIngestJobStore {
  enqueue(input: {
    chatId: TelegramChatId;
    url: string;
    languageCode: LanguageClassroomLanguageCode;
  }): Promise<PodcastIngestJobRow>;
  claim(
    jobId: string,
    owner: string,
    leaseSeconds: number,
  ): Promise<PodcastIngestJobRow | null>;
  claimNext(
    owner: string,
    leaseSeconds: number,
  ): Promise<PodcastIngestJobRow | null>;
  renew(jobId: string, owner: string, leaseSeconds: number): Promise<void>;
  finish(
    jobId: string,
    owner: string,
    status: 'completed' | 'failed',
    lastError?: string,
  ): Promise<void>;
}

function rpcRow(data: unknown): PodcastIngestJobRow | null {
  if (!data) return null;
  const value = Array.isArray(data) ? data[0] : data;
  return (value ?? null) as PodcastIngestJobRow | null;
}

async function callClaimRpc(
  rpcName: string,
  params: Record<string, unknown>,
): Promise<PodcastIngestJobRow | null> {
  const { data, error } = await getPipelineSupabase().rpc(
    rpcName as never,
    params as never,
  );
  if (error) throwSupabaseError(error);
  return rpcRow(data);
}

async function updateProcessingJob(
  jobId: string,
  owner: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await getPipelineSupabase()
    .from('podcast_ingest_jobs')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'processing')
    .eq('lease_owner', owner);
  if (error) throwSupabaseError(error);
}

export const podcastIngestJobStore: PodcastIngestJobStore = {
  async enqueue({ chatId, url, languageCode }) {
    const { data, error } = await getPipelineSupabase().rpc(
      'enqueue_podcast_ingest_job',
      {
        p_source_url: url,
        p_language_code: languageCode,
        p_telegram_chat_id: String(chatId),
      },
    );
    if (error) throwSupabaseError(error);
    const job = rpcRow(data);
    if (!job) throw new Error('Failed to enqueue podcast ingest job');
    return job;
  },

  async claim(jobId, owner, leaseSeconds) {
    return callClaimRpc('claim_podcast_ingest_job', {
      p_job_id: jobId,
      p_owner: owner,
      p_lease_seconds: leaseSeconds,
    });
  },

  async claimNext(owner, leaseSeconds) {
    return callClaimRpc('claim_next_podcast_ingest_job', {
      p_owner: owner,
      p_lease_seconds: leaseSeconds,
    });
  },

  async renew(jobId, owner, leaseSeconds) {
    const leaseExpiresAt = new Date(
      Date.now() + leaseSeconds * 1_000,
    ).toISOString();
    await updateProcessingJob(jobId, owner, {
      lease_expires_at: leaseExpiresAt,
    });
  },

  async finish(jobId, owner, status, lastError) {
    await updateProcessingJob(jobId, owner, {
      status,
      lease_owner: null,
      lease_expires_at: null,
      last_error: lastError ?? null,
    });
  },
};
