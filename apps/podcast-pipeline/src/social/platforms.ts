import { appendBrandCta } from '../brand/cta.js';

export type SocialVideoMode = 'teaser' | 'full';
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
    videoMode: 'teaser',
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
): string {
  return SOCIAL_PLATFORM_CONFIG[platform].ctaMode === 'brand'
    ? appendBrandCta(body)
    : body.trim();
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
