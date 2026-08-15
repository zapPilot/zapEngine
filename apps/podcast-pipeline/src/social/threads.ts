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

export function createThreadsPublisher(input?: {
  accessToken?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  onLog?: (message: string) => void;
}): ThreadsPublisher {
  const apiBaseUrl = input?.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  const fetchImpl = input?.fetchImpl ?? fetch;
  const log = input?.onLog ?? (() => void 0);
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
  },
): Promise<PublishResult> {
  context.log('[threads] Publishing text and episode link');
  const published = await threadsStep('publish', () =>
    requestThreadsApi(
      'POST',
      '/me/threads',
      {
        media_type: 'TEXT',
        text: input.text.trim(),
        link_attachment: input.episodeUrl,
        auto_publish_text: 'true',
      },
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
