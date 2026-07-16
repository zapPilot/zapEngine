import { isRecord } from '../lib/typeGuards.js';
import type {
  EpisodeVideoResponse,
  LanguageClassroomLanguageCode,
} from '../types.js';
import {
  findEpisodeLocalizationByEpisodeId,
  listCompletedEpisodeVideosByLocalizationIds,
} from './db.js';

export type SharePagePlatform = 'ios' | 'android' | 'desktop';

export interface SharePageEpisode {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  video?: EpisodeVideoResponse | null;
}

export interface RenderEpisodeSharePageInput {
  episode: SharePageEpisode;
  platform: SharePagePlatform;
  iosAppId: string;
  iosAppStoreUrl: string;
  canonicalUrl: string;
  appDeepLinkUrl: string;
}

const APP_NAME = 'From Fed to Chain';
const IOS_APP_STORE_URL =
  'https://apps.apple.com/app/from-fed-to-chain/id6749248542';
const IOS_APP_ID = extractIosAppId(IOS_APP_STORE_URL);
const SHARE_BASE_URL = 'https://from-fed-to-chain-api.fly.dev';
const APP_CUSTOM_SCHEME = 'zappilotv2';
// Keep this in sync with the final iOS bundle ID before App Store submission.
const APPLE_APP_ID = 'LP8CA4MT6U.com.example.fromFedToChainApp';
const DEFAULT_SHARE_IMAGE_URL =
  'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/03/5b/2f/035b2fde-5258-a71b-86af-e5a7c3b9987d/AppIcon-0-0-1x_U007emarketing-0-8-0-0-85-220.png/512x512bb.jpg';
const DEFAULT_DESCRIPTION =
  'Listen to From Fed to Chain for clear stories about global finance, blockchain, and DeFi.';

export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: [APPLE_APP_ID],
        components: [{ '/': '/e/*' }],
      },
      {
        appID: APPLE_APP_ID,
        paths: ['/e/*'],
      },
    ],
  },
};

export function detectPlatform(
  userAgent: string | undefined,
): SharePagePlatform {
  const ua = userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'ios';
  }
  if (/Macintosh/i.test(ua) && /Mobile/i.test(ua)) {
    return 'ios';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }

  return 'desktop';
}

export async function buildEpisodeSharePageHtml(input: {
  id: string;
  languageCode: LanguageClassroomLanguageCode;
  userAgent: string | undefined;
}): Promise<string | null> {
  const localization = await findEpisodeLocalizationByEpisodeId(
    input.id,
    input.languageCode,
  );

  if (!localization) {
    return null;
  }

  const videos = await listCompletedEpisodeVideosByLocalizationIds([
    localization.id,
  ]);
  const video = videos.get(localization.id) ?? null;

  const langQuery = `?lang=${encodeURIComponent(input.languageCode)}`;

  return renderEpisodeSharePage({
    episode: {
      id: localization.episode_id,
      title: localization.title,
      description: localization.raw_text ?? localization.script ?? '',
      coverUrl: getLocalizationCoverUrl(localization),
      video,
    },
    platform: detectPlatform(input.userAgent),
    iosAppId: IOS_APP_ID,
    iosAppStoreUrl: IOS_APP_STORE_URL,
    canonicalUrl: `${SHARE_BASE_URL}/e/${encodeURIComponent(input.id)}${langQuery}`,
    appDeepLinkUrl: `${APP_CUSTOM_SCHEME}://podcast/${encodeURIComponent(localization.id)}${langQuery}`,
  });
}

export function renderEpisodeSharePage(
  input: RenderEpisodeSharePageInput,
): string {
  const title = input.episode.title.trim() || APP_NAME;
  const description = summarizeDescription(input.episode.description, title);
  const video = input.episode.video ?? null;
  const coverUrl =
    video?.thumbnailUrl.trim() ||
    input.episode.coverUrl.trim() ||
    DEFAULT_SHARE_IMAGE_URL;
  const episodeMedia = renderEpisodeMedia(coverUrl, video);
  const platformContent = renderPlatformContent({
    ...input,
    episode: {
      ...input.episode,
      title,
      description,
      coverUrl,
    },
  });
  const appleSmartBannerMeta =
    input.platform === 'ios'
      ? `<meta name="apple-itunes-app" content="app-id=${htmlEscape(
          input.iosAppId,
        )}, app-argument=${htmlEscape(input.appDeepLinkUrl)}">`
      : '';
  const openGraphVideoMeta = video
    ? `<meta property="og:video" content="${htmlEscape(video.url)}">
  <meta property="og:video:type" content="video/mp4">
  <meta property="og:video:width" content="1920">
  <meta property="og:video:height" content="1080">`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(title)} | ${APP_NAME}</title>
  <link rel="canonical" href="${htmlEscape(input.canonicalUrl)}">
  <meta name="description" content="${htmlEscape(description)}">
  <meta property="og:title" content="${htmlEscape(title)}">
  <meta property="og:description" content="${htmlEscape(description)}">
  <meta property="og:image" content="${htmlEscape(coverUrl)}">
  <meta property="og:url" content="${htmlEscape(input.canonicalUrl)}">
  <meta property="og:type" content="${video ? 'video.other' : 'music.song'}">
  ${openGraphVideoMeta}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${htmlEscape(title)}">
  <meta name="twitter:description" content="${htmlEscape(description)}">
  <meta name="twitter:image" content="${htmlEscape(coverUrl)}">
  ${appleSmartBannerMeta}
  <style>
    :root {
      color-scheme: light dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f6f8fb;
      color: #171717;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px 18px;
      background:
        linear-gradient(135deg, rgba(15, 118, 110, 0.08), transparent 42%),
        #f6f8fb;
    }

    main {
      width: min(100%, 680px);
    }

    .episode {
      display: grid;
      grid-template-columns: minmax(112px, 168px) 1fr;
      gap: 24px;
      align-items: center;
      padding: 28px;
      border: 1px solid rgba(23, 23, 23, 0.12);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.88);
      box-shadow: 0 18px 48px rgba(23, 23, 23, 0.07);
    }

    .episode.has-video {
      grid-template-columns: 1fr;
    }

    .episode-media {
      width: 100%;
      object-fit: cover;
      border-radius: 8px;
      background: #0b0b0b;
    }

    img.episode-media {
      aspect-ratio: 1;
    }

    video.episode-media {
      aspect-ratio: 16 / 9;
    }

    .eyebrow {
      margin: 0 0 8px;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
      color: #0f766e;
    }

    h1 {
      margin: 0;
      font-size: 2.5rem;
      line-height: 1.05;
      letter-spacing: 0;
    }

    p {
      margin: 14px 0 0;
      font-size: 1rem;
      line-height: 1.6;
      color: #3b3b3b;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 22px;
    }

    a.button {
      display: inline-flex;
      min-height: 44px;
      align-items: center;
      justify-content: center;
      padding: 0 18px;
      border-radius: 8px;
      background: #171717;
      color: #fff;
      font-weight: 700;
      text-decoration: none;
    }

    a.button.button-secondary {
      background: #eef2f7;
      color: #171717;
    }

    @media (max-width: 560px) {
      body {
        padding: 22px 14px;
      }

      .episode {
        grid-template-columns: 1fr;
        padding: 18px;
      }

      h1 {
        font-size: 1.8rem;
      }

      img.episode-media {
        max-width: 220px;
      }
    }

    @media (prefers-color-scheme: dark) {
      :root {
        background: #14110e;
        color: #faf7f1;
      }

      body {
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.06), transparent 42%),
          #101114;
      }

      .episode {
        border-color: rgba(255, 255, 255, 0.12);
        background: rgba(28, 25, 22, 0.92);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
      }

      .eyebrow {
        color: #5eead4;
      }

      p {
        color: #ded7cd;
      }

      a.button {
        background: #faf7f1;
        color: #171717;
      }

      a.button.button-secondary {
        background: #2f3642;
        color: #faf7f1;
      }

    }
  </style>
</head>
<body>
  <main>
    <section class="episode${video ? ' has-video' : ''}" aria-label="Shared episode">
      ${episodeMedia}
      <div>
        <p class="eyebrow">${APP_NAME}</p>
        <h1>${htmlEscape(title)}</h1>
        <p>${htmlEscape(description)}</p>
        ${platformContent}
      </div>
    </section>
  </main>
</body>
</html>`;
}

function renderPlatformContent(input: RenderEpisodeSharePageInput): string {
  const appStoreAction =
    input.platform === 'ios'
      ? `
          <a class="button button-secondary" href="${htmlEscape(input.iosAppStoreUrl)}">Get Zap Pilot</a>`
      : '';

  return `<div class="actions">
          <a class="button" href="${htmlEscape(input.appDeepLinkUrl)}">Open in Zap Pilot</a>${appStoreAction}
        </div>`;
}

function renderEpisodeMedia(
  coverUrl: string,
  video: EpisodeVideoResponse | null,
): string {
  if (!video) {
    return `<img class="episode-media" src="${htmlEscape(coverUrl)}" alt="">`;
  }

  return `<video class="episode-media" controls playsinline preload="metadata" poster="${htmlEscape(coverUrl)}" aria-label="Episode video">
        <source src="${htmlEscape(video.url)}" type="video/mp4">
        Your browser does not support HTML5 video.
      </video>`;
}

function summarizeDescription(description: string, title: string): string {
  const value =
    description.trim() ||
    (title === APP_NAME
      ? DEFAULT_DESCRIPTION
      : `Listen to "${title}" in the ${APP_NAME} app.`);
  const normalized = value.replace(/\s+/g, ' ');
  if (normalized.length <= 220) {
    return normalized;
  }

  return `${normalized.slice(0, 217).trimEnd()}...`;
}

function getLocalizationCoverUrl(localization: unknown): string {
  if (!isRecord(localization)) {
    return '';
  }

  const coverUrl = localization['cover_url'] ?? localization['coverUrl'];
  return typeof coverUrl === 'string' ? coverUrl : '';
}

export function extractIosAppId(appStoreUrl: string): string {
  const appId = /\/id(\d+)(?:\D|$)/.exec(appStoreUrl)?.[1];
  if (!appId) {
    throw new Error('IOS_APP_STORE_URL must include a numeric /id value');
  }

  return appId;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
