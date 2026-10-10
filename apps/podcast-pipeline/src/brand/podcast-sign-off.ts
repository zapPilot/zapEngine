import type { LanguageClassroomLanguageCode } from '../types.js';

// Persisted packaging is recognized by exact literals. Never assemble these
// strings at runtime or edit a released version; add a new version instead.
export const PODCAST_PACKAGING_VERSION = 'podcast-script.v2';
export const PODCAST_SIGN_OFF = {
  'zh-Hant': {
    intro: '欢迎收听 Zap Podcast。',
    outro:
      'Your strategy, your machine, your wallet——Zap Pilot 正在打造一套自托管的可编程投资组合运行环境，想了解进展，可以到 Zap Pilot 官网看看。',
  },
  ja: {
    intro: 'Zap Podcast へようこそ。',
    outro:
      'Your strategy, your machine, your wallet――Zap Pilot は、プログラム可能なポートフォリオのためのセルフホスト型ランタイムを開発中で、進捗は Zap Pilot の公式サイトでご覧いただけます。',
  },
  en: {
    intro: 'Welcome to Zap Podcast.',
    outro:
      'Your strategy, your machine, your wallet — Zap Pilot is building a self-hosted runtime for programmable portfolios, and you can follow its progress on the Zap Pilot website.',
  },
} as const satisfies Record<
  LanguageClassroomLanguageCode,
  { intro: string; outro: string }
>;
export const LEGACY_PODCAST_INTROS = [
  '各位觀眾朋友，歡迎收聽今天的 Zap Podcast。',
  '歡迎收聽 Zap Podcast。',
  '欢迎收听 Zap Podcast。',
] as const;
export const LEGACY_PODCAST_OUTROS = [
  '如果你也在管理多个钱包、DeFi 仓位和投资组合，可以到 Zap Pilot 官网，让投资组合管理更简单、更清楚。',
  '如果你也在管理多個錢包、DeFi 部位和投資組合，可以到 Zap Pilot 官網，讓投資組合管理更簡單、更清楚。',
] as const;
