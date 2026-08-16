import { SocialPublishError } from './publish-error.js';
import {
  describeThreadsApiError,
  isRecord,
  nonemptyString,
  parseThreadsApiJson,
} from './threads-api.js';
import { assertThreadsSessionReady } from './threads-auth.js';
import type {
  PublishResult,
  ThreadsPublisher,
  ThreadsPublishInput,
} from './types.js';

export { getThreadsProfile, type ThreadsProfile } from './threads-auth.js';

const DEFAULT_API_BASE_URL = 'https://graph.threads.net';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_STATUS_POLL_INTERVAL_MS = 1_000;
const DEFAULT_STATUS_POLL_ATTEMPTS = 60;

type Sleep = (delayMs: number) => Promise<void>;

export function createThreadsPublisher(input?: {
  accessToken?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  onLog?: (message: string) => void;
  sleep?: Sleep;
  statusPollIntervalMs?: number;
  statusPollAttempts?: number;
}): ThreadsPublisher {
  const apiBaseUrl = input?.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  const fetchImpl = input?.fetchImpl ?? fetch;
  const log = input?.onLog ?? (() => void 0);
  const sleep =
    input?.sleep ??
    ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const statusPollIntervalMs =
    input?.statusPollIntervalMs ?? DEFAULT_STATUS_POLL_INTERVAL_MS;
  const statusPollAttempts =
    input?.statusPollAttempts ?? DEFAULT_STATUS_POLL_ATTEMPTS;
  const getAccessToken =
    input?.getAccessToken ??
    (input?.accessToken !== undefined
      ? async () => input.accessToken ?? ''
      : async () => (await assertThreadsSessionReady()).session.accessToken);

  return {
    async publishThreads(payload) {
      let token: string;
      try {
        token = (await getAccessToken()).trim();
      } catch (error) {
        throw new SocialPublishError(
          'threads',
          'credentials',
          withLoginGuidance(error),
        );
      }
      if (!token) {
        throw new SocialPublishError(
          'threads',
          'credentials',
          'Threads is not logged in. Run `pnpm social:login` first.',
        );
      }
      return publishThreads(payload, {
        accessToken: token,
        apiBaseUrl,
        fetchImpl,
        log,
        sleep,
        statusPollIntervalMs,
        statusPollAttempts,
      });
    },
  };
}

async function publishThreads(
  input: ThreadsPublishInput,
  context: {
    accessToken: string;
    apiBaseUrl: string;
    fetchImpl: typeof fetch;
    log: (message: string) => void;
    sleep: Sleep;
    statusPollIntervalMs: number;
    statusPollAttempts: number;
  },
): Promise<PublishResult> {
  const videoUrl = requirePublicVideoUrl(input.videoUrl);
  context.log('[threads] Creating native video container');
  const created = await threadsStep('create_video', () =>
    requestThreadsApi(
      'POST',
      '/me/threads',
      {
        media_type: 'VIDEO',
        video_url: videoUrl,
        text: input.text.trim(),
      },
      context,
    ),
  );
  const creationId = requireId(created, 'video container');

  context.log('[threads] Waiting for video processing');
  await threadsStep('wait_video', () =>
    waitForVideoContainer(creationId, context),
  );

  context.log('[threads] Publishing native video');
  const published = await threadsStep('publish', () =>
    requestThreadsApi(
      'POST',
      '/me/threads_publish',
      { creation_id: creationId },
      context,
    ),
  );
  const postId = requireId(published, 'published post');

  return {
    status: 'published',
    publishedAt: new Date().toISOString(),
    postId,
  };
}

async function waitForVideoContainer(
  creationId: string,
  context: {
    accessToken: string;
    apiBaseUrl: string;
    fetchImpl: typeof fetch;
    sleep: Sleep;
    statusPollIntervalMs: number;
    statusPollAttempts: number;
  },
): Promise<void> {
  for (let attempt = 0; attempt < context.statusPollAttempts; attempt += 1) {
    const body = await requestThreadsApi(
      'GET',
      `/${encodeURIComponent(creationId)}`,
      { fields: 'id,status,error_message' },
      context,
    );
    const status = containerStatus(body);
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(containerFailureMessage(body, status));
    }
    if (status !== 'IN_PROGRESS') {
      throw new Error(
        `Threads video container returned unexpected status ${status}.`,
      );
    }
    if (attempt + 1 < context.statusPollAttempts) {
      await context.sleep(context.statusPollIntervalMs);
    }
  }
  throw new Error(
    `Threads video container did not finish after ${context.statusPollAttempts} status checks.`,
  );
}

async function requestThreadsApi(
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, string>,
  context: {
    accessToken: string;
    apiBaseUrl: string;
    fetchImpl: typeof fetch;
  },
): Promise<unknown> {
  const url = new URL(path, context.apiBaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await context.fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${context.accessToken}`,
    },
    signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  const body = parseThreadsApiJson(raw);

  if (!response.ok) {
    throw new Error(describeThreadsApiError(response.status, body, raw));
  }
  return body;
}

function requirePublicVideoUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch (error) {
    throw new Error('Threads video URL must be a valid public HTTPS URL.', {
      cause: error,
    });
  }
  if (url.protocol !== 'https:') {
    throw new Error('Threads video URL must be a valid public HTTPS URL.');
  }
  return url.href;
}

function requireId(value: unknown, label: string): string {
  if (!isRecord(value)) {
    throw new Error(`Threads API returned an invalid ${label} response.`);
  }
  const id = value['id'];
  if (!nonemptyString(id)) {
    throw new Error(`Threads API returned ${label} without an id.`);
  }
  return id.trim();
}

function containerStatus(value: unknown): string {
  if (!isRecord(value) || !nonemptyString(value['status'])) {
    throw new Error('Threads API returned video container without a status.');
  }
  return value['status'].trim().toUpperCase();
}

function containerFailureMessage(value: unknown, status: string): string {
  const detail =
    isRecord(value) && nonemptyString(value['error_message'])
      ? `: ${value['error_message'].trim()}`
      : '';
  return `Threads video container ${status}${detail}`;
}

function withLoginGuidance(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  if (detail.includes('pnpm social:login')) {
    return error instanceof Error ? error : new Error(detail);
  }
  return new Error(
    `${detail}\nRun \`pnpm social:login\` to reconnect Threads.`,
    { cause: error },
  );
}

async function threadsStep<T>(
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new SocialPublishError('threads', name, error);
  }
}
