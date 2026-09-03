import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import sharp from 'sharp';

import { errorMessage } from '../lib/errorMessage.js';
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
const THUMBNAIL_UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';
const ANALYTICS_REPORTS_URL =
  'https://youtubeanalytics.googleapis.com/v2/reports';
const REQUEST_TIMEOUT_MS = 30_000;
const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const YOUTUBE_THUMBNAIL_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/octet-stream',
]);

interface YouTubeVideoResponse {
  id: string;
}

interface PreparedYouTubeThumbnail {
  body: Buffer;
  contentType: string;
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

      let thumbnail: PreparedYouTubeThumbnail | null = null;
      const thumbnailUrl = publishInput.thumbnailUrl?.trim();
      if (thumbnailUrl) {
        log('[youtube] Preparing canonical thumbnail');
        try {
          thumbnail = await prepareYouTubeThumbnail({
            thumbnailUrl,
            fetchImpl,
          });
        } catch (error) {
          throw new SocialPublishError('youtube', 'prepare_thumbnail', error);
        }
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

      if (thumbnail) {
        log('[youtube] Setting canonical thumbnail');
        try {
          await setYouTubeThumbnail({
            videoId: video.id,
            thumbnail,
            accessToken: session.accessToken,
            fetchImpl,
          });
        } catch (error) {
          // The video already exists at this point. Failing the lane would make
          // the release retry upload a duplicate video, so preserve the publish
          // result and leave a loud repair signal instead.
          log(
            `[youtube] WARNING: video ${video.id} published but canonical thumbnail was not set: ${errorMessage(error)}`,
          );
        }
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

async function prepareYouTubeThumbnail(input: {
  thumbnailUrl: string;
  fetchImpl: typeof fetch;
}): Promise<PreparedYouTubeThumbnail> {
  const response = await input.fetchImpl(input.thumbnailUrl, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Canonical thumbnail download failed with HTTP ${response.status}.`,
    );
  }

  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.length === 0) {
    throw new Error('Canonical thumbnail download returned an empty body.');
  }
  const contentType = normalizeContentType(response.headers.get('content-type'));
  if (
    raw.length <= YOUTUBE_THUMBNAIL_MAX_BYTES &&
    YOUTUBE_THUMBNAIL_MIME_TYPES.has(contentType)
  ) {
    return { body: raw, contentType };
  }

  let body = await sharp(raw)
    .rotate()
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toBuffer();
  if (body.length > YOUTUBE_THUMBNAIL_MAX_BYTES) {
    body = await sharp(raw)
      .rotate()
      .resize({ width: 720, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  }
  if (body.length > YOUTUBE_THUMBNAIL_MAX_BYTES) {
    throw new Error(
      `Canonical thumbnail remains ${body.length} bytes after compression; YouTube allows at most ${YOUTUBE_THUMBNAIL_MAX_BYTES} bytes.`,
    );
  }
  return { body, contentType: 'image/jpeg' };
}

function normalizeContentType(value: string | null): string {
  const contentType = value?.split(';', 1)[0]?.trim().toLowerCase();
  return contentType || 'application/octet-stream';
}

async function setYouTubeThumbnail(input: {
  videoId: string;
  thumbnail: PreparedYouTubeThumbnail;
  accessToken: string;
  fetchImpl: typeof fetch;
}): Promise<void> {
  const url = new URL(THUMBNAIL_UPLOAD_URL);
  url.searchParams.set('videoId', input.videoId);
  url.searchParams.set('uploadType', 'media');
  const response = await input.fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': input.thumbnail.contentType,
      'content-length': String(input.thumbnail.body.length),
    },
    body: input.thumbnail.body as unknown as BodyInit,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(await describeYouTubeError(response));
  }
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
