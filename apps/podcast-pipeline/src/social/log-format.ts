export function languageFlag(language: string): string {
  switch (language) {
    case 'zh-Hant':
      return '🇹🇼';
    case 'ja':
      return '🇯🇵';
    case 'en':
      return '🇺🇸';
    default:
      return '🌐';
  }
}

export function platformIcon(platform: string): string {
  switch (platform) {
    case 'rednote':
      return '📕';
    case 'x':
      return '𝕏';
    case 'youtube':
      return '▶️';
    case 'threads':
      return '🧵';
    default:
      return '❓';
  }
}

export function platformLabel(platform: string): string {
  return `${platformIcon(platform)} ${platform}`;
}

export function languageLabel(language: string): string {
  return `${languageFlag(language)} ${language}`;
}

export function laneLabel(platform: string, language: string): string {
  return `${platformIcon(platform)} ${platform} ${languageFlag(language)} ${language}`;
}
