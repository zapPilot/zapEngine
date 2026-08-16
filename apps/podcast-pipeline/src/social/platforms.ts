export const SOCIAL_PLATFORM_CONFIG = {
  x: {
    label: 'X',
    reviewShortcut: 'x',
    requiresLocalVideo: true,
  },
  threads: {
    label: 'Threads',
    reviewShortcut: 't',
    requiresLocalVideo: false,
  },
  rednote: {
    label: 'Rednote',
    reviewShortcut: 'r',
    requiresLocalVideo: true,
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

export function requiresLocalVideo(
  platforms: readonly SocialPlatform[],
): boolean {
  return platforms.some(
    (platform) => SOCIAL_PLATFORM_CONFIG[platform].requiresLocalVideo,
  );
}
