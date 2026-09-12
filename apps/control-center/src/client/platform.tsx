import type { CSSProperties } from 'react';

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

export function languageFlag(languageCode: string): string {
  switch (languageCode) {
    case 'en':
      return '🇺🇸';
    case 'ja':
      return '🇯🇵';
    case 'zh-Hant':
      return '🇹🇼';
    case 'zh-Hans':
      return '🇨🇳';
    default:
      return '🌐';
  }
}

const identityStyle: CSSProperties = {
  alignItems: 'center',
  display: 'inline-flex',
  gap: '0.35em',
  minWidth: 0,
};

const iconStyle: CSSProperties = {
  display: 'block',
  flex: '0 0 auto',
  height: '1em',
  objectFit: 'contain',
  width: '1em',
};

export function PlatformIdentity(props: { platform: string }) {
  const icon = platformIconPath(props.platform);
  return (
    <span style={identityStyle}>
      {icon ? (
        <img alt="" aria-hidden="true" src={icon} style={iconStyle} />
      ) : null}
      <span>{platformLabel(props.platform)}</span>
    </span>
  );
}

export function LanguageIdentity(props: { languageCode: string }) {
  return (
    <span style={identityStyle}>
      <span aria-hidden="true">{languageFlag(props.languageCode)}</span>
      <span>{props.languageCode}</span>
    </span>
  );
}
