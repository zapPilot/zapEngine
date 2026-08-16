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
import { assertYouTubeSessionReady } from './youtube-auth.js';

const RESUMABLE_UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos';
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
      const session = await assertYouTubeSessionReady({ fetchImpl });
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
        defaultLanguage: 'zh-Hant',
        defaultAudioLanguage: 'zh-Hant',
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
  const body = createReadStream(input.videoPath) as unknown as BodyInit;
  const response = await input.fetchImpl(input.uploadUrl, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-length': String(file.size),
      'content-type': 'video/mp4',
    },
    body,
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
