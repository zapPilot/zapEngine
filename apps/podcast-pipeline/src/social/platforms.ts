export const SOCIAL_PLATFORM_CONFIG = {
  x: {
    label: 'X',
    reviewShortcut: 'x',
    requiresVideo: false,
  },
  threads: {
    label: 'Threads',
    reviewShortcut: 't',
    requiresVideo: false,
  },
  rednote: {
    label: 'Rednote',
    reviewShortcut: 'r',
    requiresVideo: true,
  },
} as const;

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

export function requiresVideo(platforms: readonly SocialPlatform[]): boolean {
  return platforms.some(
    (platform) => SOCIAL_PLATFORM_CONFIG[platform].requiresVideo,
  );
}
