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
