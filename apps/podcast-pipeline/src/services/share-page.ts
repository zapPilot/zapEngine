import { buildPodcastEpisodeShareUrl } from '@zapengine/types/shared';

import type {
  EpisodeVideoResponse,
  LanguageClassroomLanguageCode,
} from '../types.js';
import {
  findEpisodeLocalizationByEpisodeId,
  listEpisodeVideoSummariesByLocalizationIds,
} from './db.js';

export interface SharePageEpisode {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  video?: EpisodeVideoResponse | null;
}

export interface RenderEpisodeSharePageInput {
  episode: SharePageEpisode;
  canonicalUrl: string;
  webEpisodeUrl: string;
}

export type EpisodeShareResolution =
  | { kind: 'not-found' }
  | { kind: 'redirect'; location: string }
  | { kind: 'page'; html: string };

const APP_NAME = 'From Fed to Chain';
const APP_WEB_ORIGIN = 'https://v2.zap-pilot.org';
const LINK_PREVIEW_USER_AGENT_MARKERS = [
  'facebookexternalhit',
  'twitterbot',
  'telegrambot',
  'slackbot',
  'discordbot',
  'whatsapp',
  'linespider',
  'skypeuripreview',
  'embedly',
  'redditbot',
  'pinterest',
  'applebot',
  'googlebot',
  'bingbot',
  'bot',
  'crawler',
  'spider',
  'preview',
  'curl',
  'wget',
  'python-requests',
  'node-fetch',
  'okhttp',
  'go-http-client',
] as const;
// Matches apps/app/app.config.ts: the iOS build ships under the App Store
// listing the Flutter app created. Keep the two in sync.
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

function episodeWebUrl(
  localizationId: string,
  languageCode: LanguageClassroomLanguageCode,
): string {
  return `${APP_WEB_ORIGIN}/podcast/${encodeURIComponent(localizationId)}?lang=${encodeURIComponent(languageCode)}`;
}

function isLinkPreviewCrawler(userAgent: string | undefined): boolean {
  const normalized = userAgent?.toLowerCase() ?? '';
  return LINK_PREVIEW_USER_AGENT_MARKERS.some((marker) =>
    normalized.includes(marker),
  );
}

export async function resolveEpisodeShare(input: {
  id: string;
  languageCode: LanguageClassroomLanguageCode;
  userAgent: string | undefined;
  accept: string | undefined;
}): Promise<EpisodeShareResolution> {
  const localization = await findEpisodeLocalizationByEpisodeId(
    input.id,
    input.languageCode,
  );

  if (!localization) {
    return { kind: 'not-found' };
  }

  // An installed app claims /e/* through the OS before any request is made, so
  // a browser that reaches this handler has no app to open the link in. Every
  // platform therefore goes to the web episode; only link-preview crawlers and
  // non-browser clients get the metadata page.
  const webEpisodeUrl = episodeWebUrl(localization.id, input.languageCode);
  if (
    Boolean(input.userAgent?.trim()) &&
    !isLinkPreviewCrawler(input.userAgent) &&
    input.accept?.toLowerCase().includes('text/html') === true
  ) {
    return { kind: 'redirect', location: webEpisodeUrl };
  }

  const videoSummaries = await listEpisodeVideoSummariesByLocalizationIds([
    localization.id,
  ]);
  const video = videoSummaries.get(localization.id)?.video ?? null;

  return {
    kind: 'page',
    html: renderEpisodeSharePage({
      episode: {
        id: localization.episode_id,
        title: localization.title,
        description: localization.raw_text ?? localization.script ?? '',
        coverUrl: '',
        video,
      },
      canonicalUrl: buildPodcastEpisodeShareUrl(input.id, input.languageCode),
      webEpisodeUrl,
    }),
  };
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
  const videoSize = video ? videoDimensions(video.url) : null;
  const openGraphVideoMeta =
    video && videoSize
      ? `<meta property="og:video" content="${htmlEscape(video.url)}">
  <meta property="og:video:type" content="video/mp4">
  <meta property="og:video:width" content="${videoSize.width}">
  <meta property="og:video:height" content="${videoSize.height}">`
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
        <div class="actions">
          <a class="button" href="${htmlEscape(input.webEpisodeUrl)}">Listen on the web</a>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

// Renderer versions v1-v3 are the closed set of historical 16:9 renders;
// every later renderer version produces the current portrait news layout.
const LANDSCAPE_RENDERER_URL_SEGMENTS = [
  '/video/satori-resvg-v1/',
  '/video/satori-resvg-v2/',
  '/video/satori-resvg-v3/',
] as const;

function videoDimensions(videoUrl: string): { width: number; height: number } {
  const isLegacyLandscape = LANDSCAPE_RENDERER_URL_SEGMENTS.some((segment) =>
    videoUrl.includes(segment),
  );
  return isLegacyLandscape
    ? { width: 1920, height: 1080 }
    : { width: 1080, height: 1920 };
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

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
