import { appendBrandCta, socialSignOff } from '../brand/cta.js';
import type { PrimaryLanguageCode } from '../types.js';
import { weightedTweetLength, X_TOTAL_MAX_WEIGHTED_LENGTH } from './x-text.js';

export const THREADS_TOTAL_MAX_CHARACTERS = 500;

// Meta Threads API Media Specifications, verified 2026-10-04:
// https://developers.facebook.com/documentation/threads/posts#video-specifications
export const THREADS_VIDEO_LIMIT_SECONDS = 300;

export type SocialVideoMode = 'teaser' | 'full-or-teaser' | 'full';
export type SocialCtaMode = 'brand' | 'none';

export const SOCIAL_PLATFORM_CONFIG = {
  x: {
    label: 'X',
    reviewShortcut: 'x',
    requiresLocalVideo: true,
    videoMode: 'teaser',
    ctaMode: 'brand',
  },
  threads: {
    label: 'Threads',
    reviewShortcut: 't',
    requiresLocalVideo: false,
    videoMode: 'full-or-teaser',
    ctaMode: 'brand',
  },
  rednote: {
    label: 'Rednote',
    reviewShortcut: 'r',
    requiresLocalVideo: true,
    videoMode: 'full',
    ctaMode: 'none',
  },
  youtube: {
    label: 'YouTube',
    reviewShortcut: 'y',
    requiresLocalVideo: true,
    videoMode: 'full',
    ctaMode: 'brand',
  },
} as const satisfies Record<
  string,
  {
    label: string;
    reviewShortcut: string;
    requiresLocalVideo: boolean;
    videoMode: SocialVideoMode;
    ctaMode: SocialCtaMode;
  }
>;

export type SocialPlatform = keyof typeof SOCIAL_PLATFORM_CONFIG;

export const SOCIAL_PLATFORMS = Object.keys(
  SOCIAL_PLATFORM_CONFIG,
) as SocialPlatform[];

export function isSocialPlatform(value: string): value is SocialPlatform {
  return Object.hasOwn(SOCIAL_PLATFORM_CONFIG, value);
}

export function platformLabel(platform: SocialPlatform): string {
  return SOCIAL_PLATFORM_CONFIG[platform].label;
}

export function platformVideoMode(platform: SocialPlatform): SocialVideoMode {
  return SOCIAL_PLATFORM_CONFIG[platform].videoMode;
}

export function applyPlatformCta(
  platform: SocialPlatform,
  body: string,
  languageCode: PrimaryLanguageCode = 'zh-Hant',
  destinationUrl?: string,
): string {
  if (SOCIAL_PLATFORM_CONFIG[platform].ctaMode !== 'brand') return body.trim();
  const text = body.trim();
  const signed = `${text}${text ? '\n\n' : ''}${socialSignOff(languageCode, destinationUrl)}`;
  const fits = (value: string) =>
    platform === 'x'
      ? weightedTweetLength(value) <= X_TOTAL_MAX_WEIGHTED_LENGTH
      : platform !== 'threads' ||
        Array.from(value).length <= THREADS_TOTAL_MAX_CHARACTERS;
  if (fits(signed)) return signed;
  // Frozen snapshots keep their body. Fall back to the original website CTA;
  // an already oversized legacy snapshot fails visibly rather than truncating.
  const legacy = appendBrandCta(text, languageCode, destinationUrl);
  if (!fits(legacy))
    throw new Error(
      `${platform} legacy body and CTA exceed the post length limit`,
    );
  return legacy;
}

export function requiresLocalVideo(
  platforms: readonly SocialPlatform[],
): boolean {
  return platforms.some(
    (platform) => SOCIAL_PLATFORM_CONFIG[platform].requiresLocalVideo,
  );
}

export function requiresLocalTeaser(
  platforms: readonly SocialPlatform[],
): boolean {
  return platforms.some(
    (platform) =>
      SOCIAL_PLATFORM_CONFIG[platform].requiresLocalVideo &&
      SOCIAL_PLATFORM_CONFIG[platform].videoMode === 'teaser',
  );
}
