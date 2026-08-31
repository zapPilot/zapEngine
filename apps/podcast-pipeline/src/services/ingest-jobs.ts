import { isRecord } from '../lib/typeGuards.js';
import {
  type LanguageClassroomLanguageCode,
  SUPPORTED_PRIMARY_LANGUAGE_CODES,
} from '../types.js';
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

export class PodcastIngestJobContractError extends Error {
  readonly jobId: string | undefined;

  constructor(message: string, jobId?: string) {
    super(`Invalid podcast ingest job row: ${message}`);
    this.name = 'PodcastIngestJobContractError';
    this.jobId = jobId;
  }
}

function contractJobId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const id = value['id'];
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

function contractError(value: unknown, message: string): never {
  throw new PodcastIngestJobContractError(message, contractJobId(value));
}

function requiredString(
  row: Record<string, unknown>,
  key: string,
  raw: unknown,
): string {
  const value = row[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    contractError(raw, `${key} must be a non-empty string`);
  }
  return value.trim();
}

function nullableString(
  row: Record<string, unknown>,
  key: string,
  raw: unknown,
): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string') {
    contractError(raw, `${key} must be a string or null`);
  }
  return value;
}

function validHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parsePodcastIngestJobRow(value: unknown): PodcastIngestJobRow {
  if (!isRecord(value)) {
    contractError(value, 'payload must be an object');
  }

  const id = requiredString(value, 'id', value);
  const sourceUrl = requiredString(value, 'source_url', value);
  if (!validHttpUrl(sourceUrl)) {
    contractError(value, 'source_url must be an http(s) URL');
  }

  const languageCode = requiredString(value, 'language_code', value);
  if (
    !(SUPPORTED_PRIMARY_LANGUAGE_CODES as readonly string[]).includes(
      languageCode,
    )
  ) {
    contractError(value, `unsupported language_code ${languageCode}`);
  }

  const telegramChatId = requiredString(value, 'telegram_chat_id', value);
  const status = requiredString(value, 'status', value);
  if (!['queued', 'processing', 'completed', 'failed'].includes(status)) {
    contractError(value, `unsupported status ${status}`);
  }

  const attemptCount = value['attempt_count'];
  if (
    typeof attemptCount !== 'number' ||
    !Number.isInteger(attemptCount) ||
    attemptCount < 0
  ) {
    contractError(value, 'attempt_count must be a non-negative integer');
  }

  return {
    id,
    source_url: sourceUrl,
    language_code: languageCode as LanguageClassroomLanguageCode,
    telegram_chat_id: telegramChatId,
    status: status as PodcastIngestJobStatus,
    attempt_count: attemptCount,
    lease_owner: nullableString(value, 'lease_owner', value),
    lease_expires_at: nullableString(value, 'lease_expires_at', value),
    last_error: nullableString(value, 'last_error', value),
  };
}

function rawRpcRow(data: unknown): unknown {
  if (data === null || data === undefined) return null;
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function isNullCompositeRow(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const fields = Object.values(value);
  return fields.length > 0 && fields.every((field) => field === null);
}

/**
 * Postgres composite-returning functions serialize an unassigned row variable
 * as an object whose every field is null. For claim RPCs that value means
 * "nothing was claimed", not "a job full of nulls".
 */
export function parsePodcastIngestJobRpcResult(
  data: unknown,
): PodcastIngestJobRow | null {
  const value = rawRpcRow(data);
  if (value === null || isNullCompositeRow(value)) return null;
  return parsePodcastIngestJobRow(value);
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
  return parsePodcastIngestJobRpcResult(data);
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
    const job = parsePodcastIngestJobRpcResult(data);
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
