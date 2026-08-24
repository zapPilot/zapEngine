import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import {
  isPlainRecord as isRecord,
  nonemptyString,
} from '../lib/typeGuards.js';
import { SocialPublishError } from './publish-error.js';
import type {
  PublishResult,
  YouTubePublisher,
  YouTubePublishInput,
} from './types.js';
import {
  assertYouTubeSessionReady,
  YOUTUBE_ANALYTICS_SCOPE,
} from './youtube-auth.js';

const RESUMABLE_UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos';
const ANALYTICS_REPORTS_URL =
  'https://youtubeanalytics.googleapis.com/v2/reports';
const REQUEST_TIMEOUT_MS = 30_000;

interface YouTubeVideoResponse {
  id: string;
}

export function createYouTubePublisher(input?: {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  onLog?: (message: string) => void;
}): YouTubePublisher {
  const fetchImpl = input?.fetchImpl ?? fetch;
  const now = input?.now ?? (() => new Date());
  const log = input?.onLog ?? (() => void 0);

  return {
    publishYouTube: async (publishInput) => {
      const session = await assertYouTubeSessionReady({
        fetchImpl,
        additionalScopes: [YOUTUBE_ANALYTICS_SCOPE],
      });
      try {
        const channelId = await assertYouTubeChannel({
          accessToken: session.accessToken,
          fetchImpl,
          now,
        });
        log(`[youtube] Publishing to channel ${channelId}`);
      } catch (error) {
        throw new SocialPublishError('youtube', 'verify_channel', error);
      }

      let uploadUrl: string;
      try {
        uploadUrl = await createUploadSession({
          input: publishInput,
          accessToken: session.accessToken,
          fetchImpl,
        });
      } catch (error) {
        throw new SocialPublishError('youtube', 'create_upload_session', error);
      }

      log('[youtube] Uploading video');
      let video: YouTubeVideoResponse;
      try {
        video = await uploadVideo({
          uploadUrl,
          videoPath: publishInput.videoPath,
          accessToken: session.accessToken,
          fetchImpl,
        });
      } catch (error) {
        throw new SocialPublishError('youtube', 'upload_video', error);
      }

      return {
        status: 'published',
        postId: video.id,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        publishedAt: now().toISOString(),
      } satisfies PublishResult;
    },
  };
}

/**
 * Proves which channel the session is about to upload to. `youtube.upload`
 * cannot read the signed-in identity back (`channels.list?mine=true` answers 403
 * without `youtube.readonly`), but the Analytics report scope the session
 * already carries only reports on channels the account owns: the expected
 * channel answers 200 and any other channel answers 403. Deleting a video that
 * landed on the wrong channel is impossible under the upload-only scope, so the
 * check has to run before the upload, not after it.
 */
export async function assertYouTubeChannel(input: {
  accessToken: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<string> {
  const channelId = readExpectedChannelId(input.env ?? process.env);
  const day = (input.now?.() ?? new Date()).toISOString().slice(0, 10);
  const url = new URL(ANALYTICS_REPORTS_URL);
  url.searchParams.set('ids', `channel==${channelId}`);
  url.searchParams.set('metrics', 'views');
  url.searchParams.set('startDate', day);
  url.searchParams.set('endDate', day);

  const response = await (input.fetchImpl ?? fetch)(url, {
    headers: { authorization: `Bearer ${input.accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `The signed-in Google account cannot report on YouTube channel ${channelId}: ${await describeYouTubeError(response)}. Run \`pnpm social:login\` and authorize the account that owns that channel.`,
    );
  }
  return channelId;
}

function readExpectedChannelId(env: NodeJS.ProcessEnv): string {
  const channelId = env['YOUTUBE_CHANNEL_ID']?.trim();
  if (!channelId) {
    throw new Error(
      'YOUTUBE_CHANNEL_ID is not configured. Set the only YouTube channel this publisher may upload to in the repository root .env.',
    );
  }
  return channelId;
}

async function createUploadSession(input: {
  input: YouTubePublishInput;
  accessToken: string;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const file = await stat(input.input.videoPath);
  const url = new URL(RESUMABLE_UPLOAD_URL);
  url.searchParams.set('uploadType', 'resumable');
  url.searchParams.set('part', 'snippet,status');

  const response = await input.fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': String(file.size),
      'x-upload-content-type': 'video/mp4',
    },
    body: JSON.stringify({
      snippet: {
        title: input.input.title,
        description: input.input.description,
        categoryId: '27',
        defaultLanguage: input.input.languageCode ?? 'zh-Hant',
        defaultAudioLanguage: input.input.languageCode ?? 'zh-Hant',
      },
      status: {
        privacyStatus: input.input.privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(await describeYouTubeError(response));
  }

  const location = response.headers.get('location')?.trim();
  if (!location) {
    throw new Error('YouTube did not return a resumable upload URL.');
  }
  return location;
}

async function uploadVideo(input: {
  uploadUrl: string;
  videoPath: string;
  accessToken: string;
  fetchImpl: typeof fetch;
}): Promise<YouTubeVideoResponse> {
  const file = await stat(input.videoPath);
  const body = createReadStream(input.videoPath);
  try {
    const response = await input.fetchImpl(input.uploadUrl, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-length': String(file.size),
        'content-type': 'video/mp4',
      },
      body: body as unknown as BodyInit,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    if (!response.ok) {
      throw new Error(await describeYouTubeError(response));
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload) || !nonemptyString(payload['id'])) {
      throw new Error('YouTube upload response did not include a video id.');
    }
    return { id: nonemptyString(payload['id'])! };
  } finally {
    const closed = body.closed ? null : once(body, 'close');
    body.destroy();
    if (closed) await closed;
  }
}

async function describeYouTubeError(response: Response): Promise<string> {
  const text = await response.text();
  if (text.trim()) {
    try {
      const payload = JSON.parse(text) as unknown;
      if (isRecord(payload) && isRecord(payload['error'])) {
        const message = nonemptyString(payload['error']['message']);
        if (message) return `YouTube API ${response.status}: ${message}`;
      }
    } catch {
      return `YouTube API ${response.status}: ${text.trim()}`;
    }
  }
  return `YouTube API request failed with HTTP ${response.status}.`;
}
