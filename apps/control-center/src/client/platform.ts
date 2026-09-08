export function platformLabel(platform: string): string {
  switch (platform) {
    case 'x':
      return 'X';
    case 'rednote':
      return 'Rednote';
    case 'youtube':
      return 'YouTube';
    case 'threads':
      return 'Threads';
    default:
      return platform;
  }
}

export function platformEmoji(platform: string): string {
  switch (platform) {
    case 'x':
      return '𝕏';
    case 'rednote':
      return '📕';
    case 'youtube':
      return '▶️';
    case 'threads':
      return '🧵';
    default:
      return '•';
  }
}

export function platformIconPath(platform: string): string | null {
  switch (platform) {
    case 'x':
      return '/platform-icons/x.svg';
    case 'rednote':
      return '/platform-icons/rednote.svg';
    case 'youtube':
      return '/platform-icons/youtube.svg';
    case 'threads':
      return '/platform-icons/threads.svg';
    default:
      return null;
  }
}
